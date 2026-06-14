// 语音合成：默认 edge(免费微软语音)；off 时返回 null 由前端用浏览器语音兜底
import config from '../config.js';

let MsEdgeTTS, OUTPUT_FORMAT;
async function loadEdge() {
  if (MsEdgeTTS) return;
  const mod = await import('msedge-tts');
  MsEdgeTTS = mod.MsEdgeTTS;
  OUTPUT_FORMAT = mod.OUTPUT_FORMAT;
}

// 返回 { buffer, contentType } 或 null
export async function synthesize(text) {
  if (!text || config.ttsProvider === 'off') return null;

  if (config.ttsProvider === 'edge') {
    try {
      await loadEdge();
      const tts = new MsEdgeTTS();
      await tts.setMetadata(config.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);
      const chunks = [];
      await new Promise((resolve, reject) => {
        audioStream.on('data', (c) => chunks.push(c));
        audioStream.on('end', resolve);
        audioStream.on('close', resolve);
        audioStream.on('error', reject);
      });
      return { buffer: Buffer.concat(chunks), contentType: 'audio/mpeg' };
    } catch (e) {
      console.error('[tts] edge failed:', e.message);
      return null; // 前端兜底
    }
  }

  if (config.ttsProvider === 'dashscope') {
    // 占位：阿里云 CosyVoice 升级位。需要时按官方文档接入，
    // 失败则返回 null 由前端浏览器语音兜底。
    console.warn('[tts] dashscope provider 尚未实现，使用前端兜底');
    return null;
  }

  return null;
}
