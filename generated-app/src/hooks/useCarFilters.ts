import { useCallback, useMemo, useState } from "react";
import type { Car } from "@/types";

/**
 * Client-side car narrowing hook.
 *
 * Owns the search / year / sort state and derives the narrowed, ordered list
 * from the supplied inventory. All combined narrowing rules live here so that
 * presentational components stay dumb and fully controlled.
 */

/** Field the filtered list is ordered by. */
export type SortBy = "year" | "make";

/** Result of {@link useCarFilters} — narrowing state plus the derived list. */
export interface UseCarFiltersResult {
  /** Free-text query matched against the car model. */
  search: string;
  /** Replaces the free-text query. */
  setSearch: (value: string) => void;
  /**
   * Selected model year as a string; `''` means "all years".
   */
  year: string;
  /** Replaces the selected year; pass `''` to clear the year filter. */
  setYear: (value: string) => void;
  /** Field the filtered list is ordered by. */
  sortBy: SortBy;
  /** Replaces the sort field. */
  setSortBy: (value: SortBy) => void;
  /** Sorted, distinct list of years present in the supplied cars. */
  years: number[];
  /** Cars remaining after search + year filtering, ordered by {@link sortBy}. */
  filteredCars: Car[];
  /** Resets search, year and sort back to their initial values. */
  clearFilters: () => void;
}

/** Initial (and post-clear) sort field. */
const DEFAULT_SORT_BY: SortBy = "year";

/**
 * Derives search / year / sort state and the narrowed car list from the
 * supplied inventory.
 *
 * A `year` of `''` means no year filter is applied. `years` is the sorted
 * distinct set of years present in `cars`.
 */
export function useCarFilters(cars: Car[]): UseCarFiltersResult {
  const [search, setSearch] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT_BY);

  const years = useMemo<number[]>(() => {
    const distinct = new Set<number>();
    for (const car of cars) {
      distinct.add(car.year);
    }
    return Array.from(distinct).sort((a, b) => a - b);
  }, [cars]);

  const filteredCars = useMemo<Car[]>(() => {
    const needle = search.trim().toLowerCase();
    const selectedYear = year === "" ? null : Number(year);

    const narrowed = cars.filter((car) => {
      const matchesSearch =
        needle === "" || car.model.toLowerCase().includes(needle);
      const matchesYear =
        selectedYear === null ||
        Number.isNaN(selectedYear) ||
        car.year === selectedYear;
      return matchesSearch && matchesYear;
    });

    return [...narrowed].sort((a, b) =>
      sortBy === "make"
        ? a.make.localeCompare(b.make)
        : a.year - b.year
    );
  }, [cars, search, year, sortBy]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setYear("");
    setSortBy(DEFAULT_SORT_BY);
  }, []);

  return {
    search,
    setSearch,
    year,
    setYear,
    sortBy,
    setSortBy,
    years,
    filteredCars,
    clearFilters,
  };
}