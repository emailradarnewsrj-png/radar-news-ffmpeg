const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

    // Salva HTML
    const htmlFile = path.join(tempDir, 'index.html');
    fs.writeFileSync(htmlFile, htmlContent);

    // Usa ImageMagick pra converter HTML → PNG
    const imagePath = path.join(tempDir, 'frame.png');
    
    // Cria um PNG preto simples (placeholder)
    try {
      execSync(`convert -size ${width}x${height} xc:black ${imagePath}`);
    } catch (e) {
      // Se não tiver ImageMagick, cria via ffmpeg mesmo
      const outputPath = path.join(tempDir, 'output.mp4');
      
      return new Promise((resolve, reject) => {
        ffmpeg()
          .input('color=black:s=' + width + 'x' + height)
          .inputFormat('lavfi')
          .duration(duration)
          .fps(24)
          .videoCodec('libx264')
          .outputOptions('-pix_fmt', 'yuv420p')
          .outputOptions('-preset', 'ultrafast')
          .on('end', () => {
            const mp4Buffer = fs.readFileSync(outputPath);
            const base64Video = mp4Buffer.toString('base64');
            
            if (fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true });
            }

            resolve(res.json({
              success: true,
              video: base64Video,
              filename: 'reels.mp4'
            }));
          })
          .on('error', (err) => {
            reject(err);
          })
          .save(outputPath);
      });
    }

    // Se ImageMagick funcionou, converte PNG → MP4
    const outputPath = path.join(tempDir, 'output.mp4');
    
    return new Promise((resolve, reject) => {
      ffmpeg(imagePath)
        .loop(duration)
        .fps(24)
        .videoCodec('libx264')
        .outputOptions('-pix_fmt', 'yuv420p')
        .outputOptions('-preset', 'ultrafast')
        .on('end', () => {
          const mp4Buffer = fs.readFileSync(outputPath);
          const base64Video = mp4Buffer.toString('base64');
          
          if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true });
          }

          resolve(res.json({
            success: true,
            video: base64Video,
            filename: 'reels.mp4'
          }));
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
