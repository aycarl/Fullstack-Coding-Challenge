import { Card, CardContent, Typography } from "@mui/material";
import type { Car } from "@/types";

export interface CarCardProps {
  car: Car;
}

/**
 * Presentational card for a single car.
 *
 * The artwork is served through a `<picture>` element with three
 * non-overlapping breakpoints:
 *   - mobile:  up to 640px
 *   - tablet:  641px – 1023px
 *   - desktop: 1024px and above (also the `<img>` fallback)
 */
export default function CarCard({ car }: CarCardProps) {
  const label = `${car.make} ${car.model}`;

  return (
    <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <picture>
        <source media="(max-width: 640px)" srcSet={car.mobile} />
        <source
          media="(min-width: 641px) and (max-width: 1023px)"
          srcSet={car.tablet}
        />
        <source media="(min-width: 1024px)" srcSet={car.desktop} />
        <img
          src={car.desktop}
          alt={`${label} — ${car.year} ${car.color}`}
          loading="lazy"
          style={{ display: "block", width: "100%", height: "auto" }}
        />
      </picture>
      <CardContent>
        <Typography variant="h6" component="h2">
          {car.year} {car.make} {car.model}
        </Typography>
        <Typography color="text.secondary">{car.color}</Typography>
      </CardContent>
    </Card>
  );
}