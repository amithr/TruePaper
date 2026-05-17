import { useEffect, useRef } from "react";

/** Keep a ref to the latest value without updating during render (React Compiler / eslint). */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
