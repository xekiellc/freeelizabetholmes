const https = require('https');
const fs = require('fs');

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const queries = [
  'Elizabeth Holmes pardon',
  'Elizabeth Holmes clemency',
  'Elizabeth Holmes sentence reduction',
  'Elizabeth Holmes children',
  'Elizabeth Holmes science Theranos',
  'Elizabeth Holmes oversentenced'
];

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function post(hostname, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchArticles() {
  const seen = new Set();
  const articles = [];
  for (const q of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${NEWS_API_KEY}`;
      const data = await get(url);
      if (!data.articles) continue;
      for (const a of data.articles) {
        if (!a.url || seen.has(a.url)) continue;
        seen.add(a.url);
        articles.push({
          title: a.title,
          url: a.url,
          source: a.source?.name || '',
          date: a.publishedAt
        });
      }
    } catch(e) {
      console.error('Fetch error:', e.message);
    }
  }
  return articles;
}

async function filterWithClaude(articles) {
  if (!articles.length) return [];
  const prompt = `You are the editor of FreeElizabethHolmes.com, an advocacy site arguing Elizabeth Holmes was oversentenced and her vision was legitimate science.

Review these news articles and return ONLY the ones that are:
- Sympathetic to Elizabeth Holmes
- Critical of her prosecution or sentencing
- Supportive of the Theranos technology or vision
- About her children, family, or personal story in a humanizing way
- About clemency, pardon, or sentence reduction

REJECT any article that primarily frames her as a fraudster or criminal.

Return a JSON array of approved articles in this exact format with no other text:
[{"title":"...","url":"...","source":"...","date":"..."}]

If none qualify, return: []

Articles to review:
${JSON.stringify(articles, null, 2)}`;

  try {
    const data = await post('api.anthropic.com', '/v1/messages', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = data.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error('Claude error:', e.message);
    return [];
  }
}

async function main() {
  console.log('Fetching articles...');
  const articles = await fetchArticles();
  console.log(`Found ${articles.length} articles`);
  console.log('Filtering with Claude...');
  const approved = await filterWithClaude(articles);
  console.log(`Approved ${approved.length} articles`);
  const final = approved.slice(0, 18);
  fs.writeFileSync('news.json', JSON.stringify(final, null, 2));
  console.log('news.json updated');
}

main();
