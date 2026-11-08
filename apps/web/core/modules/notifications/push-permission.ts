export function canOfferPush(
  subscribed: boolean,
  supported: boolean,
  permission: NotificationPermission,
): boolean {
  return subscribed && supported && permission !== 'denied';
}

export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
