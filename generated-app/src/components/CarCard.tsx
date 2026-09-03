import { Card, CardActionArea, CardContent, Typography } from "@mui/material";
import type { Car } from "@/types";

/**
 * Props accepted by {@link CarCard}.
 */
export interface CarCardProps {
  /** The car to present. */
  car: Car;
  /** Called with the car id when the card is activated. */
  onSelect?: (id: string) => void;
}

/**
 * Presentational card for a single car.
 *
 * Renders a responsive `<picture>` (desktop / tablet / mobile art direction,
 * widest source first so the browser picks the first matching media query)
 * together with the make, model, year and color. Activating the card reports
 * the car id through `onSelect`.
 */
export default function CarCard({ car, onSelect }: CarCardProps) {
  const label = `${car.year} ${car.make} ${car.model}`;

  const handleClick = () => {
    onSelect?.(car.id);
  };

  return (
    <Card sx={{ height: "100%" }}>
      <CardActionArea onClick={handleClick} sx={{ height: "100%" }}>
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
            loading="lazy"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              objectFit: "cover",
            }}
          />
        </picture>
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            {car.year} {car.make} {car.model}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Color: {car.color}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}