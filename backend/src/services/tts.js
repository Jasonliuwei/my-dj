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

  if (config.ttsProvider === 'eleven') {
    try {
      const voice = process.env.ELEVEN_VOICE_ID;
      const key = process.env.ELEVEN_API_KEY;
      const model = process.env.ELEVEN_MODEL || 'eleven_multilingual_v2';
      if (!voice || !key) {
        console.warn('[tts] eleven 缺少 ELEVEN_VOICE_ID 或 ELEVEN_API_KEY');
        return null;
      }
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': key,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
          }),
        }
      );
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(`eleven ${res.status} ${msg.slice(0, 120)}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return { buffer: buf, contentType: 'audio/mpeg' };
    } catch (e) {
      console.error('[tts] eleven failed:', e.message);
      return null; // 前端兜底
    }
  }

  if (config.ttsProvider === 'minimax') {
    try {
      const key = process.env.MINIMAX_API_KEY;
      const group = process.env.MINIMAX_GROUP_ID;
      const voice = process.env.MINIMAX_VOICE_ID || 'male-qn-qingse';
      const model = process.env.MINIMAX_MODEL || 'speech-02-hd';
      const base = process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat';
      const volume = Number.parseFloat(process.env.MINIMAX_VOLUME || '3');
      if (!key || !group) {
        console.warn('[tts] minimax 缺少 MINIMAX_API_KEY 或 MINIMAX_GROUP_ID');
        return null;
      }
      const res = await fetch(`${base}/v1/t2a_v2?GroupId=${group}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          text,
          stream: false,
          voice_setting: { voice_id: voice, speed: 1.0, vol: volume, pitch: 0 },
          audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
        }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => '');
        throw new Error(`minimax ${res.status} ${msg.slice(0, 120)}`);
      }
      // T2A v2 返回 JSON,音频在 data.audio 里是 hex 字符串
      const data = await res.json();
      const code = data?.base_resp?.status_code;
      const hex = data?.data?.audio;
      if (code !== 0 || !hex) {
        throw new Error(`minimax resp ${code} ${data?.base_resp?.status_msg || ''}${hex ? '' : ' (no audio)'}`.slice(0, 160));
      }
      return { buffer: Buffer.from(hex, 'hex'), contentType: 'audio/mpeg' };
    } catch (e) {
      console.error('[tts] minimax failed:', e.message);
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
