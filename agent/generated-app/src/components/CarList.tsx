import { Alert, Box, CircularProgress, Grid, Typography } from "@mui/material";
import CarCard from "@/components/CarCard";
import type { Car } from "@/types";

export interface CarListProps {
  cars: Car[];
  loading: boolean;
  error?: Error;
}

/**
 * Presentational gallery of cars.
 *
 * Rendering precedence:
 *   1. `error`   — an error alert (car cards are never shown alongside it)
 *   2. `loading` — a centred progress indicator
 *   3. empty     — an empty-state message when there are no cars
 *   4. otherwise — a responsive grid of `CarCard`s
 */
export default function CarList({ cars, loading, error }: CarListProps) {
  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  if (loading) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", py: 6 }}
        aria-busy="true"
      >
        <CircularProgress aria-label="Loading cars" />
      </Box>
    );
  }

  if (cars.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          No cars to display. Try adjusting your search or add a new car.
        </Typography>
      </Box>
    );
  }

  return (
    <Grid container spacing={3}>
      {cars.map((car) => (
        <Grid item key={car.id} xs={12} sm={6} md={4}>
          <CarCard car={car} />
        </Grid>
      ))}
    </Grid>
  );
}