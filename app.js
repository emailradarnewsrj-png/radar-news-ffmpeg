const express = require('express');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'FFmpeg server is running' });
});

app.post('/render-to-video', async (req, res) => {
  let tempDir = null;
  try {
    const { htmlContent, width = 1080, height = 1920, duration = 5 } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ error: 'htmlContent é obrigatório' });
    }

    tempDir = path.join(os.tmpdir(), `ffmpeg-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const htmlFile = path.join(tempDir, 'index.html');
    fs.writeFileSync(htmlFile, htmlContent);

    // Usa Playwright ao invés de Puppeteer (mais leve)
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.setViewportSize({ width, height });
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle' });
    
    const screenshotPath = path.join(tempDir, 'frame.png');
    await page.screenshot({ path: screenshotPath });
    await browser.close();

    // Converte PNG → MP4
    const outputPath = path.join(tempDir, 'output.mp4');
    
    await new Promise((resolve, reject) => {
      ffmpeg(screenshotPath)
        .loop(duration)
        .fps(24)
        .outputOptions('-c:v', 'libx264')
        .outputOptions('-pix_fmt', 'yuv420p')
        .outputOptions('-preset', 'ultrafast')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    const mp4Buffer = fs.readFileSync(outputPath);
    const base64Video = mp4Buffer.toString('base64');

    // Limpa
    fs.rmSync(tempDir, { recursive: true });

    res.json({
      success: true,
      video: base64Video,
      filename: 'reels.mp4'
    });

  } catch (error) {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg server running on port ${PORT}`);
});
