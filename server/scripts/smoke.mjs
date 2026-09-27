/**
 * End-to-end check of a running race server: two players make and join a room, play a moment,
 * one drops out and comes back, a third is turned away.
 *
 *   npm run dev                                  # in another terminal: wrangler dev on :8787
 *   npm run smoke                                # or: SERVER=https://oxy8-race.<you>.workers.dev npm run smoke
 */
const SERVER = process.env.SERVER ?? 'http://127.0.0.1:8787';
const WS = SERVER.replace(/^http/, 'ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
};

function client(path) {
  const ws = new WebSocket(`${WS}${path}`);
  const inbox = [];
  ws.addEventListener('message', (e) => inbox.push(JSON.parse(e.data)));
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const send = (m) => ws.send(JSON.stringify(m));
  const types = () => inbox.map((m) => m.t);
  const snaps = () => inbox.filter((m) => m.t === 'snap').map((m) => m.snap);
  return { ws, inbox, opened, send, types, snaps };
}

const res = await fetch(`${SERVER}/rooms`, { method: 'POST' });
const { code } = await res.json();
check(/^[A-Z]{4}$/.test(code), `room code ${code}`);

const a = client(`/rooms/${code}?create=1`);
await a.opened;
await sleep(200);
check(a.types().join() === 'welcome,waiting', `first player waits (${a.types().join()})`);

const b = client(`/rooms/${code.toLowerCase()}`);
await b.opened;
await sleep(300);
const startA = a.inbox.find((m) => m.t === 'start');
const startB = b.inbox.find((m) => m.t === 'start');
check(startA && startB && startA.seed === startB.seed && startA.seat === 0 && startB.seat === 1, 'both get the same planet');

a.send({ t: 'input', input: { moveX: 1, moveY: 0, interact: false, toggleLamp: false, useBottle: false, placeBeacon: false, placeBomb: false } });
const x0 = a.snaps().at(-1)?.me.x;
await sleep(1500);
const snapsA = a.snaps();
check(snapsA.length >= 12 && snapsA.length <= 25, `about ${1000 / 50 / 2} snapshots per second (${snapsA.length} in ~1.8 s)`);
check(snapsA.at(-1).me.x > x0, 'player 1 walks');
check(b.snaps().at(-1).other.body === null, 'player 2 cannot see player 1 across the map');
check(!JSON.stringify(b.snaps().at(-1)).includes('looted'), 'no bunker contents on the wire');

b.ws.close();
await sleep(300);
check(a.types().includes('opponent-away'), 'player 1 hears that player 2 dropped out');
const b2 = client(`/rooms/${code}?seat=1`);
await b2.opened;
await sleep(300);
check(b2.types().slice(0, 3).join() === 'welcome,start,snap', `player 2 comes back (${b2.types().slice(0, 3).join()})`);
check(a.types().includes('opponent-back'), 'player 1 hears that player 2 is back');

const c = client(`/rooms/${code}`);
await c.opened.catch(() => {});
await sleep(300);
check(c.inbox[0]?.t === 'error', `a third player is turned away (${c.inbox[0]?.text})`);

const d = client('/rooms/ZZZZ');
await d.opened.catch(() => {});
await sleep(300);
check(d.inbox[0]?.t === 'error', `an unknown room says so (${d.inbox[0]?.text})`);

// A room whose maker leaves before anyone joins is given up.
const { code: code2 } = await (await fetch(`${SERVER}/rooms`, { method: 'POST' })).json();
const e = client(`/rooms/${code2}?create=1`);
await e.opened;
await sleep(200);
e.ws.close();
await sleep(300);
const f = client(`/rooms/${code2}`);
await f.opened.catch(() => {});
await sleep(300);
check(f.inbox[0]?.t === 'error', 'a room whose maker left is gone');

for (const x of [a, b2, c, d, f]) x.ws.close();
console.log(failures ? `${failures} failed` : 'all good');
process.exit(failures ? 1 : 0);
