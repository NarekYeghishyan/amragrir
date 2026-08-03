/**
 * Nothing, which is what the modal slot holds on every route that is not an
 * intercepted one. Next requires a `default` for a parallel slot; without it a
 * hard navigation to any other page 404s the slot and takes the page with it.
 */
export default function ModalDefault() {
  return null;
}
