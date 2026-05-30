// api/diagnose-bike.js — Unified bike diagnosis endpoint
// Handles both image (base64) and text description diagnosis
import { guard } from './_security.js';

export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 5, rateWindow: 60000 })) return;

  const { image, mediaType, description } = req.body;
  if (!image && !description) return res.status(400).json({ error: 'Provide image or description' });

  // Validar imagen: max 5MB, solo formatos permitidos
  if (image) {
    if (image.length > 5 * 1024 * 1024)
      return res.status(413).json({ error: 'Image too large (max 5MB)' });
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(mediaType))
      return res.status(415).json({ error: 'Only JPEG, PNG, WebP, GIF allowed' });
  }
  // Validar descripción
  if (description && description.length > 2000)
    return res.status(400).json({ error: 'Description too long (max 2000 chars)' });

  const isText = !!description && !image;

  const systemPrompt = `You are an expert bicycle mechanic at Dr. Bike Sydney, a premium mobile bike repair service in Sydney, Australia. ${isText ? 'Analyse the client description and provide a diagnosis.' : 'Analyse the bike image and provide a diagnosis.'} Respond ONLY with valid JSON, no other text.`;

  const userContent = isText
    ? `Client description: "${description}"\n\nRespond ONLY with JSON:\n{\n  "diagnosis": "brief diagnosis",\n  "severity": "low|medium|high",\n  "services": ["recommended service 1", "service 2"],\n  "estimatedCost": "$X–$Y",\n  "urgency": "Can wait|Book soon|Urgent",\n  "details": "detailed explanation"\n}`
    : [
        { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: image } },
        { type: 'text', text: 'Analyse this bike image and respond ONLY with JSON:\n{\n  "diagnosis": "brief diagnosis",\n  "severity": "low|medium|high",\n  "services": ["recommended service 1"],\n  "estimatedCost": "$X–$Y",\n  "urgency": "Can wait|Book soon|Urgent",\n  "details": "detailed explanation"\n}' }
      ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: isText ? userContent : userContent }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch(e) {
    console.error('Diagnose error:', e);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
