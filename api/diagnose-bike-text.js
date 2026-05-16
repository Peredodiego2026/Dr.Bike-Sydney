import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return; // 10/min AI endpoints
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'No description provided' });

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
        messages: [{
          role: 'user',
          content: `You are an expert bicycle mechanic at Dr. Bike Sydney, a premium mobile bike repair service.

A client has described a problem or noise with their bicycle. Analyse their description and provide a diagnosis.

Client description: "${description}"

Respond ONLY with a valid JSON object, no other text:

{
  "problem": "Brief description of the most likely issue based on the sound/description (1 sentence)",
  "urgency": "low" | "medium" | "high",
  "recommended_service": "Exact service name from our menu",
  "price_estimate": "$XX–$XX",
  "explanation": "2-3 sentences explaining what likely causes this sound/issue and why this service is needed",
  "tips": "One safety tip or thing the rider can check right now"
}

Our services: Tune-Up ($97), Brake Bleed ($77), Gear Adjustment ($57), Standard Service ($147), E-Bike Diagnostic ($97), Flat Tyre Repair ($37), Brake Pad Install ($35), Chain Replace ($45), Cable Replace ($55), Wheel True ($65), Safety Check ($45), Full Overhaul ($197).

Common bike sounds guide:
- Clicking/ticking when pedaling → Bottom bracket, pedals, or chain issue
- Squealing brakes → Brake pads worn or contaminated, needs Brake Pad Install or Bleed
- Chain skipping/slipping → Chain worn, needs Chain Replace or Gear Adjustment  
- Creaking frame/headset → Headset or frame bolts loose, needs Safety Check or Tune-Up
- Rubbing sound → Wheel misaligned (Wheel True) or brake rubbing (Tune-Up)
- Grinding when braking → Pads worn to metal, urgent Brake Pad Install needed
- Wobbly wheel → Wheel True needed
- Gear not shifting → Cable Replace or Gear Adjustment
- General poor performance → Tune-Up or Standard Service

If urgency is high (grinding brakes, structural issue), make it clear this is a safety concern.`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI diagnosis failed');

    const text = data.content?.[0]?.text || '{}';
    let diagnosis;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      diagnosis = JSON.parse(clean);
    } catch(e) {
      diagnosis = {
        problem: 'Unable to identify specific issue from description',
        urgency: 'low',
        recommended_service: 'Safety Check',
        price_estimate: '$45',
        explanation: 'Our mechanic will perform a full safety inspection to identify the issue.',
        tips: 'If brakes feel unsafe, avoid riding until inspected.'
      };
    }

    return res.status(200).json({ diagnosis });

  } catch (error) {
    console.error('Text diagnosis error:', error);
    return res.status(500).json({ error: error.message });
  }
}
