import { useState } from "react";
import type { FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useAddCar } from "@/hooks/useCarInventory";
import type { Car } from "@/types";

/**
 * Props accepted by {@link AddCarForm}.
 */
export interface AddCarFormProps {
  /** Called with the newly created car once the mutation succeeds. */
  onAdded?: (car: Car) => void;
}

/** Per-field validation messages; a missing key means the field is valid. */
interface FieldErrors {
  make?: string;
  model?: string;
  year?: string;
  color?: string;
}

/** Helper text on an invalid field is announced, so it needs an alert role. */
const HELPER_TEXT_SLOT_PROPS = {
  formHelperText: { role: "alert" as const },
};

/**
 * Controlled form for adding a car to the inventory.
 *
 * Every field is controlled local state. Submitting validates that make,
 * model, year and color are supplied — when anything is missing the mutation
 * is never fired and per-field messages are surfaced instead. On success the
 * fields are reset and the created car is reported through `onAdded`; on
 * failure the typed values are kept so the user can retry.
 */
export default function AddCarForm({ onAdded }: AddCarFormProps) {
  const { addCar, loading, error } = useAddCar();

  const [make, setMake] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [color, setColor] = useState<string>("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};

    if (make.trim() === "") next.make = "Make is required";
    if (model.trim() === "") next.model = "Model is required";

    if (year.trim() === "") {
      next.year = "Year is required";
    } else if (!Number.isFinite(Number(year))) {
      next.year = "Year must be a number";
    }

    if (color.trim() === "") next.color = "Color is required";

    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const created = await addCar({
      make: make.trim(),
      model: model.trim(),
      year: Number(year),
      color: color.trim(),
    });

    if (created) {
      setMake("");
      setModel("");
      setYear("");
      setColor("");
      setErrors({});
      onAdded?.(created);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      sx={{ mb: 3 }}
    >
      <Typography variant="h6" component="h2" gutterBottom>
        Add a car
      </Typography>

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ flexWrap: "wrap", alignItems: "flex-start" }}
      >
        <TextField
          label="Make"
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            setErrors((current) => ({ ...current, make: undefined }));
          }}
          error={Boolean(errors.make)}
          {...(errors.make ? { helperText: errors.make } : {})}
          slotProps={HELPER_TEXT_SLOT_PROPS}
          size="small"
          sx={{ minWidth: 160 }}
        />

        <TextField
          label="Model"
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setErrors((current) => ({ ...current, model: undefined }));
          }}
          error={Boolean(errors.model)}
          {...(errors.model ? { helperText: errors.model } : {})}
          slotProps={HELPER_TEXT_SLOT_PROPS}
          size="small"
          sx={{ minWidth: 160 }}
        />

        <TextField
          label="Year"
          type="number"
          value={year}
          onChange={(event) => {
            setYear(event.target.value);
            setErrors((current) => ({ ...current, year: undefined }));
          }}
          error={Boolean(errors.year)}
          {...(errors.year ? { helperText: errors.year } : {})}
          slotProps={HELPER_TEXT_SLOT_PROPS}
          size="small"
          sx={{ minWidth: 120 }}
        />

        <TextField
          label="Color"
          value={color}
          onChange={(event) => {
            setColor(event.target.value);
            setErrors((current) => ({ ...current, color: undefined }));
          }}
          error={Boolean(errors.color)}
          {...(errors.color ? { helperText: errors.color } : {})}
          slotProps={HELPER_TEXT_SLOT_PROPS}
          size="small"
          sx={{ minWidth: 160 }}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={loading}
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {loading ? "Adding car…" : "Add car"}
        </Button>
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
        </Alert>
      ) : null}
    </Box>
  );
}