import { useState, useEffect, useRef } from 'react';

/**
 * Text input that shows a decimal keyboard on mobile (including the minus key).
 * Maintains local raw-string state so the user can type "-" before any digit.
 * Only calls onChange(number) when the current string parses to a valid number.
 * On blur, reverts the display to the last committed value if the field is incomplete.
 */
function NumericInput({ value, onChange, ...props }) {
  const committed = useRef(value ?? 0);
  const [raw, setRaw] = useState(value != null ? String(value) : '');

  // Sync display when parent changes the value externally (e.g. preset buttons)
  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value ?? 0;
      setRaw(value != null ? String(value) : '');
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={e => {
        const str = e.target.value;
        setRaw(str);
        const num = parseFloat(str);
        if (!isNaN(num)) {
          committed.current = num;
          onChange(num);
        }
      }}
      onBlur={() => {
        const num = parseFloat(raw);
        if (isNaN(num)) {
          setRaw(String(committed.current)); // revert incomplete entry (e.g. bare "-")
        } else {
          setRaw(String(num));               // normalize trailing dot: "-3." → "-3"
          committed.current = num;
        }
      }}
      {...props}
    />
  );
}

export default NumericInput;
