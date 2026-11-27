// Sonner dismisses a cancel action after invoking its handler.
export const actionErrorOptions = {
  id: "action-error",
  duration: Infinity,
  cancel: { label: "Dismiss", onClick: () => {} },
};
