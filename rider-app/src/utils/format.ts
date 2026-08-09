export function formatFare(amount: number, currency = 'LAK'): string {
  return `${currency}${amount.toLocaleString('en-US')}`;
}
