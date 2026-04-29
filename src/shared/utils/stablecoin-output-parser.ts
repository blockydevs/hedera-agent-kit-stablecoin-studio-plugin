export const stablecoinOutputParser = (rawOutput: string): { raw: any; humanMessage: string } => {
  let parsedObject;
  try {
    parsedObject = JSON.parse(rawOutput);
  } catch (error) {
    return {
      raw: { status: 'PARSE_ERROR', error, originalOutput: rawOutput },
      humanMessage: 'Error: Failed to parse stablecoin tool output. The output was malformed.',
    };
  }

  // RETURN_BYTES mode: { bytes: Uint8Array }
  if (parsedObject && parsedObject.bytes) {
    return {
      raw: parsedObject,
      humanMessage: 'Transaction bytes are ready for signing.',
    };
  }

  // Standard response: { raw, humanMessage }
  if (
    parsedObject &&
    typeof parsedObject.raw !== 'undefined' &&
    typeof parsedObject.humanMessage !== 'undefined'
  ) {
    return {
      raw: parsedObject.raw,
      humanMessage: parsedObject.humanMessage,
    };
  }

  return {
    raw: { status: 'PARSE_ERROR', originalOutput: rawOutput, parsedObject },
    humanMessage: 'Error: Stablecoin tool output had an unexpected format.',
  };
};
