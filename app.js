const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(express.json());

// Rota de teste
app.get('/', (req, res) => {
  res.json({ status: 'FFmpeg server is running' });
});

// Rota principal: gera MP4 a partir de HTML
app.post('/render-to-video', async (req, res) => {
  try {
    const { htmlContent, width = 1080, height = 1920, duration = 5 } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ error: 'htmlContent é obrigatório' });
    }

    // Cria pasta temporária
    const tempDir = path.join(os.tmpdir(), `ffmpeg-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Salva HTML em arquivo
    const htmlFile = path.join(tempDir, 'index.html');
    fs.writeFileSync(htmlFile, htmlContent);

    // Usa puppeteer pra converter HTML → PNG
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    await page.setViewport({ width, height });
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle2' });
    
    const screenshotPath = path.join(tempDir, 'frame.png');
    await page.screenshot({ path: screenshotPath });
    await browser.close();

    // Converte PNG → MP4 com FFmpeg
    const outputPath = path.join(tempDir, 'output.mp4');
    
    await new Promise((resolve, reject) => {
      ffmpeg(screenshotPath)
        .loop(duration)
        .fps(30)
        .outputOptions('-c:v', 'libx264')
        .outputOptions('-pix_fmt', 'yuv420p')
        .outputOptions('-preset', 'fast')
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Lê o arquivo MP4
    const mp4Buffer = fs.readFileSync(outputPath);
    const base64Video = mp4Buffer.toString('base64');

    // Limpa arquivos temporários
    fs.rmSync(tempDir, { recursive: true });

    res.json({
      success: true,
      video: base64Video,
      filename: 'reels.mp4'
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg server running on port ${PORT}`);
});
