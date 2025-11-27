// ===== CONFIG PUBLIC (la cererea ta, cheia în cod) =====
const CEREBRAS_API_KEY = "csk-pn5vwep6cvhnn3ekj4f55mkrhn4hvkv2yn83drphwrfw5y6k";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_MODEL = "qwen-3-32b"; // non-thinking
const CHECKOUT_ENDPOINT = "/api/create-checkout-session";
const FREE_GENERATIONS_DEFAULT = 3;

// Prompt sistem: format fix + strict culinar
const SYSTEM_RULES = `
Ești un asistent CULINAR.
- Răspunzi DOAR la subiecte despre mâncare/culinărie/ingrediente/rețete/nutriție/tehnici.
- Dacă cererea NU e culinară, răspunde exact: __UNSUPPORTED__ .
- Răspunsul în română, concis, în format:
**Denumire:** ...
**Porții:** X
**Timp:** total Y (prep Z, gătire W)
**Ingrediente:** ...
**Pași:**
1. ...
2. ...
**Sfaturi/variante:** ...
`;
