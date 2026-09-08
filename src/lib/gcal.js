// Google Calendar "template" link builder — opens a prefilled event in the
// user's browser. No OAuth or API key required.

const pad = (n) => String(n).padStart(2, '0');

// Google expects UTC datetimes formatted as YYYYMMDDTHHMMSSZ
const toGcalDate = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
  `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export const gcalUrl = ({ title, startIso, durationMin = 30, details = '' }) => {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  }
  const end = new Date(start.getTime() + durationMin * 60000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || '',
    dates: `${toGcalDate(start)}/${toGcalDate(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};
