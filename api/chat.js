import { guard, sanitize, sanitizeObj, rateLimit } from './_security.js';
export default async function handler(req, res) {
  if(guard(req, res, { rateMax: 10, rateWindow: 60000 })) return; // 10/min AI endpoints
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, userProfile } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages format' });
  if (messages.length > 20) return res.status(400).json({ error: 'Too many messages in context' });
  // Limit each message to 2000 chars to prevent prompt injection
  const safeMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000)
  }));

  try {
    const systemPrompt = `You are the Dr. Bike Sydney virtual assistant — friendly, knowledgeable, and concise. Dr. Bike is a premium mobile bicycle repair service in Sydney, Australia. Mechanics come to the client's door, home, work or park, Monday to Saturday 8am–5pm.

SERVICES & PRICES (all include $20 mobile call-out fee):
- Gear Adjustment: $57 (20–30 min)
- Flat Tyre Repair: $37 (15–20 min)  
- Brake Pad Install: $35 (20–30 min)
- Chain Replace: $45 (20 min)
- Cable Replace: $55 (30 min)
- Tune-Up: $97 (45–60 min) ← most popular
- Brake Bleed: $77 (30–45 min)
- Wheel True: $65 (30 min)
- Safety Check: $45 (20–30 min)
- E-Bike Diagnostic: $97 (45–60 min)
- Standard Service: $147 (60–90 min)
- Full Overhaul: $197 (90–120 min)

MEMBERSHIPS:
- Basic: $57/mo — 8% off, call-out waived, 1 free Tune-Up/year
- Standard: $97/mo — 12% off, 2 free Tune-Ups/year, priority booking ← most popular
- VIP: $147/mo — 18% off, 3 free Tune-Ups/year, same-day guarantee, dedicated mechanic
- All plans: 20% off with annual billing, 3-month minimum

COVERAGE: Inner West, Eastern Suburbs, CBD, North Shore, Manly, Northern Beaches, most of Sydney.

BOOKING: Online at dr-bike-sydney.vercel.app — select service, date, time, enter address. Same-day often available.

PAYMENT: Card online (Stripe). Parts at cost price, no markup.

GUARANTEE: 30-day satisfaction guarantee on all work.

${userProfile ? `CURRENT USER: ${userProfile.full_name || 'Guest'}${userProfile.membership_plan ? `, ${userProfile.membership_plan} member` : ''}` : ''}

Keep responses SHORT (2-3 sentences max). Be warm and Australian in tone. Use 1 emoji per message. If someone needs urgent help or wants to speak to a mechanic, tell them to type "mechanic" and you'll connect them. Never make up prices or services not listed above.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: systemPrompt,
        messages: messages.slice(-10) // last 10 messages for context
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI chat failed');

    const reply = data.content?.[0]?.text || "Sorry, I couldn't process that. Type 'mechanic' to speak with our team!";
    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ reply: "Sorry, I'm having trouble right now. Type 'mechanic' to speak with our team directly! 🔧" });
  }
}
