/**
 * Convert a date string to UTC start of day (00:00:00 UTC)
 * This ensures consistent date storage and querying across timezones
 */
function getUTCStartOfDay(dateInput) {
  const date = new Date(dateInput);
  // Convert to UTC by getting the components and reconstructing in UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Convert a date string to UTC end of day (23:59:59 UTC)
 * This ensures consistent date range queries across timezones
 */
function getUTCEndOfDay(dateInput) {
  const date = new Date(dateInput);
  // Convert to UTC by getting the components and reconstructing in UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

module.exports = {
  getUTCStartOfDay,
  getUTCEndOfDay
};
