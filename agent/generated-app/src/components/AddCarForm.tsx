import { useState, type ChangeEvent, type FormEvent } from "react";
import { Box, Button, Stack, TextField, Typography } from "@mui/material";

/**
 * The payload handed to `onAdd` once the form validates.
 */
export interface AddCarInput {
  make: string;
  model: string;
  year: number;
  color: string;
}

export interface AddCarFormProps {
  /** Called with the entered values (year coerced to a number) on a valid submit. */
  onAdd: (input: AddCarInput) => Promise<void>;
  /** Externally driven busy flag — disables the submit button while true. */
  submitting?: boolean;
}

interface FormValues {
  make: string;
  model: string;
  year: string;
  color: string;
}

type FieldName = keyof FormValues;

const EMPTY_VALUES: FormValues = {
  make: "",
  model: "",
  year: "",
  color: "",
};

const NO_ERRORS: Record<FieldName, boolean> = {
  make: false,
  model: false,
  year: false,
  color: false,
};

const MESSAGE_ID = "add-car-form-message";

/**
 * Controlled form for adding a car to the inventory.
 *
 * All four fields are required. Submitting with anything missing surfaces a
 * single validation message and never calls `onAdd`. After `onAdd` resolves the
 * fields are cleared; if it rejects, the entered values are preserved so the
 * user can retry.
 */
export default function AddCarForm({ onAdd, submitting = false }: AddCarFormProps) {
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Record<FieldName, boolean>>(NO_ERRORS);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const busy = submitting || pending;

  const handleChange =
    (field: FieldName) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setValues((current) => ({ ...current, [field]: next }));
      setErrors((current) =>
        current[field] ? { ...current, [field]: false } : current
      );
    };

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const make = values.make.trim();
    const model = values.model.trim();
    const color = values.color.trim();
    const yearRaw = values.year.trim();

    const missing: Record<FieldName, boolean> = {
      make: make === "",
      model: model === "",
      year: yearRaw === "",
      color: color === "",
    };

    const hasMissing =
      missing.make || missing.model || missing.year || missing.color;

    const yearNumber = Number(yearRaw);
    const yearInvalid =
      !missing.year && (!Number.isFinite(yearNumber) || yearNumber <= 0);

    if (hasMissing) {
      setErrors(missing);
      setMessage("All fields are required.");
      return;
    }

    if (yearInvalid) {
      setErrors({ ...NO_ERRORS, year: true });
      setMessage("Year must be a valid number.");
      return;
    }

    setErrors(NO_ERRORS);
    setMessage(null);
    setPending(true);

    try {
      await onAdd({ make, model, year: yearNumber, color });
      setValues(EMPTY_VALUES);
      setErrors(NO_ERRORS);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to add the car."
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={message ? MESSAGE_ID : undefined}
      sx={{ mb: 4 }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "stretch", sm: "flex-start" }}
      >
        <TextField
          id="add-car-make"
          label="Make"
          value={values.make}
          onChange={handleChange("make")}
          error={errors.make}
          fullWidth
        />
        <TextField
          id="add-car-model"
          label="Model"
          value={values.model}
          onChange={handleChange("model")}
          error={errors.model}
          fullWidth
        />
        <TextField
          id="add-car-year"
          label="Year"
          type="number"
          value={values.year}
          onChange={handleChange("year")}
          error={errors.year}
          fullWidth
        />
        <TextField
          id="add-car-color"
          label="Color"
          value={values.color}
          onChange={handleChange("color")}
          error={errors.color}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={busy}
          sx={{ whiteSpace: "nowrap", py: { sm: 1.75 } }}
        >
          Add Car
        </Button>
      </Stack>

      {message ? (
        <Typography id={MESSAGE_ID} color="error" sx={{ mt: 1.5 }}>
          {message}
        </Typography>
      ) : null}
    </Box>
  );
}