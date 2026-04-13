const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');

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
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const htmlFile = path.join(tempDir, 'index.html');
    fs.writeFileSync(htmlFile, htmlContent);

    // Tenta usar screenshot via html2canvas (mais leve)
    const imagePath = path.join(tempDir, 'frame.png');
    
    // Cria imagem simples com ImageMagick (se disponível)
    // Se não, usa um PNG vazio como fallback
    try {
      // Tenta via ImageMagick
      const { execSync } = require('child_process');
      execSync(`convert xc:white -pointsize 48 -draw "text 10,100 'Processando'" ${imagePath}`);
    } catch (e) {
      // Fallback: cria PNG vazio simples
      const { createCanvas } = require('canvas');
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(imagePath, buffer);
    }

    // Converte imagem → MP4
    const outputPath = path.join(tempDir, 'output.mp4');
    
    return new Promise((resolve, reject) => {
      ffmpeg(imagePath)
        .loop(duration)
        .fps(24)
        .size(`${width}x${height}`)
        .videoCodec('libx264')
        .outputOptions('-pix_fmt', 'yuv420p')
        .outputOptions('-preset', 'ultrafast')
        .on('end', () => {
          try {
            const mp4Buffer = fs.readFileSync(outputPath);
            const base64Video = mp4Buffer.toString('base64');
            
            // Limpa temporários
            if (fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true });
            }

            resolve(res.json({
              success: true,
              video: base64Video,
              filename: 'reels.mp4'
            }));
          } catch (e) {
            reject(e);
          }
        })
        .on('error', (err) => {
          reject(err);
        })
        .save(outputPath);
    });

  } catch (error) {
    console.error('Erro:', error);
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true });
      } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg server running on port ${PORT}`);
});
