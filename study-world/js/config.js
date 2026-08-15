// Hvem Tore er, hvor han er, og når.

export const ACTIVITIES = {
  sleep: {
    scene: 'bedroom',
    label: 'Sover',
    sub: 'Drømmer i rolige pakker',
    place: 'Smååsane, Vennesla',
  },
  coffee: {
    scene: 'kitchen',
    label: 'Morgenkaffe',
    sub: 'Første kopp, ingen hastverk',
    place: 'Smååsane, Vennesla',
  },
  work: {
    scene: 'office',
    label: 'Jobber',
    sub: 'Nettverksautomasjon og IT-drift',
    place: 'IKT Agder, Kristiansand',
  },
  fish: {
    scene: 'fjord',
    label: 'Fisker',
    sub: 'Snøret ute, hodet av',
    place: 'Venneslafjorden',
  },
  study: {
    scene: 'study',
    label: 'Studerer',
    sub: 'Lesing og lab på egen PC',
    place: 'Smååsane, Vennesla',
  },
};

// Minutter fra midnatt. Perioder kan gå over midnatt (start > slutt).
export const SCHEDULE = [
  { act: 'sleep', start: 22 * 60, end: 6 * 60 },
  { act: 'coffee', start: 6 * 60, end: 8 * 60 },
  { act: 'work', start: 8 * 60, end: 15 * 60 + 30 },
  { act: 'fish', start: 15 * 60 + 30, end: 18 * 60 },
  { act: 'study', start: 18 * 60, end: 22 * 60 },
];

export const DAY = 1440;

export function hhmm(minutes) {
  const m = ((Math.floor(minutes) % DAY) + DAY) % DAY;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function inSlot(minutes, slot) {
  return slot.start <= slot.end
    ? minutes >= slot.start && minutes < slot.end
    : minutes >= slot.start || minutes < slot.end;
}

export function slotAt(minutes) {
  const m = ((minutes % DAY) + DAY) % DAY;
  return SCHEDULE.find((s) => inSlot(m, s)) || SCHEDULE[0];
}

export function activityAt(minutes) {
  return slotAt(minutes).act;
}

/** Minutter til neste bytte, og hva som kommer. */
export function nextChange(minutes) {
  const m = ((minutes % DAY) + DAY) % DAY;
  const slot = slotAt(m);
  const until = slot.end > m ? slot.end - m : DAY - m + slot.end;
  return { at: slot.end, in: until, act: activityAt(slot.end) };
}

// Strømmer å starte med. Alle er testet mot YouTube sitt innbyggings-API —
// de fleste kjente 24/7-lofi-kanalene (blant andre Lofi Girl sin hovedstrøm)
// avviser innbygging med feil 150, og kan ikke brukes her.
// Bytt gjerne ut, men test nye ID-er før du stoler på dem.
export const TRACKS = [
  { id: 'ByZGu229-yA', title: 'lofi hip hop radio', sub: '24/7 — beats to study, relax and code to' },
  { id: '4xDzrJKXOOY', title: 'synthwave radio', sub: '24/7 — beats to chill / game to (Lofi Girl)' },
  { id: 'yLS_6yTBqU0', title: 'Regnvær om høsten', sub: '3 t studieøkt — piano og regn, pomodoro 50/10' },
  { id: '0SH4w6o5jIU', title: 'Regnvåt morgen', sub: '3 t studieøkt — rolig piano, pomodoro 50/10' },
  { id: 'iIYYDwsdYeE', title: 'Regnvåt natt', sub: '4 t studieøkt — piano fra rommet ved siden av' },
  { id: 'BdPd76_Wzvk', title: 'Bare regn', sub: '3 t studieøkt — regnlyd uten musikk' },
];
