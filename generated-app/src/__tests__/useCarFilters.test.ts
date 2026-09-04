import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useCarFilters } from "@/hooks/useCarFilters";
import type { SortBy } from "@/hooks/useCarFilters";
import type { Car } from "@/types";

/**
 * Fixtures deliberately use makes/models that do NOT appear in the seeded MSW
 * data, so an assertion can never be satisfied by a seeded record.
 */
function makeCar(
  id: string,
  make: string,
  model: string,
  year: number,
  color: string
): Car {
  const label = `${make} ${model}`;
  return {
    id,
    make,
    model,
    year,
    color,
    mobile: `https://placehold.co/640x360?text=${encodeURIComponent(label)}+Mobile`,
    tablet: `https://placehold.co/1023x576?text=${encodeURIComponent(label)}+Tablet`,
    desktop: `https://placehold.co/1440x810?text=${encodeURIComponent(label)}+Desktop`,
  };
}

const nevera = makeCar("901", "Rimac", "Nevera", 2022, "Midnight Purple");
const jesko = makeCar("902", "Koenigsegg", "Jesko", 2023, "Ghost White");
const huayra = makeCar("903", "Pagani", "Huayra", 2021, "Carbon Blue");
const nevermore = makeCar("904", "Zenvo", "Nevermore", 2023, "Matte Bronze");

const cars: Car[] = [nevera, jesko, huayra, nevermore];

describe("useCarFilters", () => {
  it("returns every car when no filters are applied", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    expect(result.current.search).toBe("");
    expect(result.current.year).toBe("");
    expect(result.current.filteredCars).toHaveLength(4);
    expect(result.current.filteredCars.map((car) => car.id).sort()).toEqual([
      "901",
      "902",
      "903",
      "904",
    ]);
  });

  it("filters by model substring, case-insensitively", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    act(() => {
      result.current.setSearch("nEvE");
    });

    expect(result.current.search).toBe("nEvE");
    expect(result.current.filteredCars.map((car) => car.model).sort()).toEqual([
      "Nevera",
      "Nevermore",
    ]);

    act(() => {
      result.current.setSearch("HUAYRA");
    });

    expect(result.current.filteredCars).toHaveLength(1);
    expect(result.current.filteredCars[0]?.model).toBe("Huayra");
  });

  it("limits results to a single model year", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    act(() => {
      result.current.setYear("2023");
    });

    expect(result.current.year).toBe("2023");
    expect(result.current.filteredCars).toHaveLength(2);
    expect(result.current.filteredCars.every((car) => car.year === 2023)).toBe(
      true
    );
    expect(result.current.filteredCars.map((car) => car.id).sort()).toEqual([
      "902",
      "904",
    ]);
  });

  it("combines search and year so only cars matching both remain", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    act(() => {
      result.current.setSearch("neve");
    });
    act(() => {
      result.current.setYear("2023");
    });

    expect(result.current.filteredCars).toHaveLength(1);
    expect(result.current.filteredCars[0]).toMatchObject({
      id: "904",
      make: "Zenvo",
      model: "Nevermore",
      year: 2023,
    });
  });

  it("sorts by year and by make", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    act(() => {
      result.current.setSortBy("year" as SortBy);
    });

    expect(result.current.sortBy).toBe("year");
    expect(result.current.filteredCars.map((car) => car.year)).toEqual([
      2021, 2022, 2023, 2023,
    ]);

    act(() => {
      result.current.setSortBy("make" as SortBy);
    });

    expect(result.current.sortBy).toBe("make");
    expect(result.current.filteredCars.map((car) => car.make)).toEqual([
      "Koenigsegg",
      "Pagani",
      "Rimac",
      "Zenvo",
    ]);
  });

  it("lists the distinct years available", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    expect(result.current.years).toHaveLength(3);
    expect([...result.current.years].sort((a, b) => a - b)).toEqual([
      2021, 2022, 2023,
    ]);
  });

  it("clearFilters resets search, year and sort so all cars are shown again", () => {
    const { result } = renderHook(() => useCarFilters(cars));

    const initialSortBy = result.current.sortBy;

    act(() => {
      result.current.setSearch("jesko");
    });
    act(() => {
      result.current.setYear("2023");
    });
    act(() => {
      result.current.setSortBy("make" as SortBy);
    });

    expect(result.current.filteredCars).toHaveLength(1);

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.search).toBe("");
    expect(result.current.year).toBe("");
    expect(result.current.sortBy).toBe(initialSortBy);
    expect(result.current.filteredCars).toHaveLength(4);
    expect(result.current.filteredCars.map((car) => car.id).sort()).toEqual([
      "901",
      "902",
      "903",
      "904",
    ]);
  });
});