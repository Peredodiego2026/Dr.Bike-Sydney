import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return; // 10/min AI endpoints
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType || 'image/jpeg',
                data: imageBase64
              }
            },
            {
              type: 'text',
              text: `You are an expert bicycle mechanic at Dr. Bike Sydney, a premium mobile bike repair service.

Analyze this bicycle image and provide a diagnosis. Respond ONLY with a valid JSON object, no other text:

{
  "problem": "Brief description of the main issue visible (1 sentence)",
  "urgency": "low" | "medium" | "high",
  "recommended_service": "Exact service name from our menu",
  "price_estimate": "$XX–$XX",
  "explanation": "2-3 sentences explaining what you see and why this service is needed",
  "tips": "One quick tip the rider can do right now while waiting for the mechanic"
}

Our services include: Tune-Up ($97), Brake Bleed ($77), Gear Adjustment ($57), Standard Service ($147), E-Bike Diagnostic ($97), Flat Tyre Repair ($37), Brake Pad Install ($35), Chain Replace ($45), Cable Replace ($55), Wheel True ($65), Safety Check ($45), Full Overhaul ($197).

If you cannot identify a specific problem, suggest a Safety Check. If the image doesn't show a bicycle or bike part, respond with urgency "low" and recommend a Safety Check.`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Claude API error:', data);
      return res.status(500).json({ error: data.error?.message || 'AI diagnosis failed' });
    }

    const text = data.content?.[0]?.text || '{}';

    // Parse JSON from response
    let diagnosis;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      diagnosis = JSON.parse(clean);
    } catch(e) {
      // Fallback if JSON parsing fails
      diagnosis = {
        problem: 'Unable to identify specific issue from image',
        urgency: 'low',
        recommended_service: 'Safety Check',
        price_estimate: '$45',
        explanation: 'Our mechanic will perform a full safety inspection to identify any issues with your bike.',
        tips: 'Check your tyre pressure and brakes before your next ride.'
      };
    }

    return res.status(200).json({ diagnosis });

  } catch (error) {
    console.error('Diagnose error:', error);
    return res.status(500).json({ error: error.message });
  }
}
