import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useCar } from "@/hooks/useCarInventory";

/**
 * Props accepted by {@link CarDetail}.
 */
export interface CarDetailProps {
  /** Id of the car whose full record should be shown. */
  id: string;
  /** Called when the back control is activated. */
  onBack?: () => void;
}

/**
 * Detail view for a single car.
 *
 * Fetches the record by id through {@link useCar} — never from a list held in
 * the cache — and renders the full record (make, model, year and color) with a
 * responsive `<picture>` using the same desktop / tablet / mobile breakpoints
 * as the gallery cards. A spinner is shown while the request is in flight and
 * an alert is shown when the car cannot be fetched or does not exist.
 */
export default function CarDetail({ id, onBack }: CarDetailProps) {
  const { car, loading, error } = useCar(id);

  const backButton = (
    <Button
      type="button"
      variant="text"
      startIcon={<ArrowBackIcon />}
      onClick={() => onBack?.()}
      sx={{ mb: 2 }}
    >
      Back to inventory
    </Button>
  );

  if (loading) {
    return (
      <Box>
        {backButton}
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error || !car) {
    return (
      <Box>
        {backButton}
        <Alert severity="error">
          {error ? error.message : `Car with id ${id} was not found`}
        </Alert>
      </Box>
    );
  }

  const label = `${car.year} ${car.make} ${car.model}`;

  return (
    <Box>
      {backButton}

      <Card>
        <picture>
          <source media="(min-width: 1024px)" srcSet={car.desktop} />
          <source
            media="(min-width: 641px) and (max-width: 1023px)"
            srcSet={car.tablet}
          />
          <source media="(max-width: 640px)" srcSet={car.mobile} />
          <img
            src={car.mobile}
            alt={label}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              objectFit: "cover",
            }}
          />
        </picture>

        <CardContent>
          <Typography variant="h4" component="h2" gutterBottom>
            {car.year} {car.make} {car.model}
          </Typography>

          <Stack spacing={0.5}>
            <Typography variant="body1" color="text.secondary">
              Color: {car.color}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}