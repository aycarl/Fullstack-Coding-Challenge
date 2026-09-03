import { Box, Alert, CircularProgress } from "@mui/material";
import { useCars } from "@/hooks/useCarInventory";
import { useCarFilters } from "@/hooks/useCarFilters";
import CarFilters from "@/components/CarFilters";
import CarCard from "@/components/CarCard";

/**
 * Props accepted by {@link CarList}.
 */
export interface CarListProps {
  /** Called with the car id when a card in the gallery is selected. */
  onSelectCar?: (id: string) => void;
}

/**
 * Gallery of the car inventory.
 *
 * Fetches the inventory through {@link useCars}, narrows it with
 * {@link useCarFilters}, renders the controlled {@link CarFilters} bar wired to
 * that state and one {@link CarCard} per remaining car. Selection is forwarded
 * to `onSelectCar`.
 */
export default function CarList({ onSelectCar }: CarListProps) {
  const { cars, loading, error } = useCars();
  const {
    search,
    setSearch,
    year,
    setYear,
    sortBy,
    setSortBy,
    years,
    filteredCars,
    clearFilters,
  } = useCarFilters(cars);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error.message}</Alert>;
  }

  return (
    <Box>
      <CarFilters
        search={search}
        onSearchChange={setSearch}
        year={year}
        onYearChange={setYear}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        years={years}
        onClear={clearFilters}
      />

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
          },
        }}
      >
        {filteredCars.map((car) => (
          <CarCard
            key={car.id}
            car={car}
            {...(onSelectCar ? { onSelect: onSelectCar } : {})}
          />
        ))}
      </Box>
    </Box>
  );
}