export function isRetryableJobError(error: Error) {
  return error.name === "APIConnectionTimeoutError" || /timed out/i.test(error.message);
}

export function isLastJobAttempt(attemptsMade: number, attempts: number) {
  return attemptsMade + 1 >= attempts;
}
