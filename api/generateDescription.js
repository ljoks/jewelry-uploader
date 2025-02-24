// api/generateDescription.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
  
    const { messages, model, max_tokens } = req.body;
    const apiKey = process.env.OPENAI_API_KEY; // Securely injected via environment variable
  
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured.' });
    }
  
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          max_tokens: max_tokens || 300,
        }),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }
  
      const data = await response.json();
      res.status(200).json(data);
    } catch (error) {
      res.status(500).json({ error: error.toString() });
    }
  }
  