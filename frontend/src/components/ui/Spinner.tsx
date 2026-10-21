export interface SpinnerProps {
  size?: "sm" | "lg";
  /** Texto announced a los lectores de pantalla. */
  label?: string;
}

/** Indicador de carga. Puremente decorativo salvo que se indique `label`. */
export function Spinner({ size = "sm", label }: SpinnerProps) {
  return (
    <>
      <span
        className={`spinner${size === "lg" ? " spinner--lg" : ""}`}
        aria-hidden={label ? undefined : "true"}
        role={label ? "status" : undefined}
      />
      {label ? <span className="visually-hidden">{label}</span> : null}
    </>
  );
}
