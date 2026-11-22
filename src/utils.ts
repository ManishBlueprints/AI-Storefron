export const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
