// api/generateGroupingAndDescriptions.js
export default async function handler(req, res) {
    // Only allow POST requests.
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const apiKey = process.env.OPENAI_API_KEY; // Ensure this is set in your environment variables.
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key is not configured.' });
    }
    
    // The payload should include model, messages, max_tokens, etc.
    const payload = req.body;
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }
      
      const data = await response.json();
      // Return the response from OpenAI to the client.
      return res.status(200).json(data);
      
    } catch (error) {
      console.error('Error in generateGroupingAndDescriptions:', error);
      return res.status(500).json({ error: error.toString() });
    }
  }
  