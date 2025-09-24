/**
 * Convert a number that can be false to checkbox numeric value.
 *
 * @param maybeFalseNumber - The value to translate.
 * @param valueWhenUnchecked - The value to use when the checkbox is unchecked.
 */
export function maybeFalseValueToCheckboxValue<TValue>(
  maybeFalseNumber: undefined | TValue | false,
  valueWhenUnchecked: TValue,
): undefined | { checked: boolean; value: TValue } {
  if (maybeFalseNumber === undefined) {
    return undefined;
  }
  if (maybeFalseNumber === false) {
    return { checked: false, value: valueWhenUnchecked };
  }
  return { checked: true, value: maybeFalseNumber };
}
