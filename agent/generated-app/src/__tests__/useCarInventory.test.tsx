import type { ReactNode } from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import type { MockedResponse } from "@apollo/client/testing";
import { describe, it, expect } from "vitest";
import { GET_CARS, GET_CAR, ADD_CAR } from "@/graphql/queries";
import { useCars, useCar, useAddCar } from "@/hooks/useCarInventory";
import type { Car } from "@/types";

/**
 * Fixtures deliberately use makes/models that do NOT appear in the seeded MSW
 * data, so an assertion can never be satisfied by a seeded record.
 */
const rimac = {
  __typename: "Car" as const,
  id: "901",
  make: "Rimac",
  model: "Nevera",
  year: 2022,
  color: "Midnight Purple",
  mobile: "https://placehold.co/640x360?text=Rimac+Nevera+Mobile",
  tablet: "https://placehold.co/1023x576?text=Rimac+Nevera+Tablet",
  desktop: "https://placehold.co/1440x810?text=Rimac+Nevera+Desktop",
};

const koenigsegg = {
  __typename: "Car" as const,
  id: "902",
  make: "Koenigsegg",
  model: "Jesko",
  year: 2023,
  color: "Ghost White",
  mobile: "https://placehold.co/640x360?text=Koenigsegg+Jesko+Mobile",
  tablet: "https://placehold.co/1023x576?text=Koenigsegg+Jesko+Tablet",
  desktop: "https://placehold.co/1440x810?text=Koenigsegg+Jesko+Desktop",
};

const pagani = {
  __typename: "Car" as const,
  id: "903",
  make: "Pagani",
  model: "Huayra",
  year: 2021,
  color: "Carbon Blue",
  mobile: "https://placehold.co/640x360?text=Pagani+Huayra+Mobile",
  tablet: "https://placehold.co/1023x576?text=Pagani+Huayra+Tablet",
  desktop: "https://placehold.co/1440x810?text=Pagani+Huayra+Desktop",
};

function makeWrapper(mocks: readonly MockedResponse[]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MockedProvider mocks={[...mocks]}>{children}</MockedProvider>;
  };
}

describe("useCars", () => {
  it("reports loading and then returns the list of cars", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [rimac, koenigsegg] } },
      },
    ];

    const { result } = renderHook(() => useCars(), {
      wrapper: makeWrapper(mocks),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.cars).toEqual([]);
    expect(result.current.error).toBeUndefined();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.cars).toHaveLength(2);
    expect(result.current.cars[0]).toMatchObject({
      id: "901",
      make: "Rimac",
      model: "Nevera",
      year: 2022,
      color: "Midnight Purple",
    });
    expect(result.current.cars.map((car) => car.model)).toEqual([
      "Nevera",
      "Jesko",
    ]);
  });

  it("surfaces an error when the cars query fails", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        error: new Error("Failed to fetch cars"),
      },
    ];

    const { result } = renderHook(() => useCars(), {
      wrapper: makeWrapper(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toContain("Failed to fetch cars");
    expect(result.current.cars).toEqual([]);
  });
});

describe("useCar", () => {
  it("issues the single-car query for the requested id and returns that car", async () => {
    // The list mock deliberately does NOT contain the requested car, so the
    // resolved value can only have come from the GET_CAR response.
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [rimac] } },
      },
      {
        request: { query: GET_CAR, variables: { id: "902" } },
        result: { data: { car: koenigsegg } },
      },
    ];

    const { result } = renderHook(() => useCar("902"), {
      wrapper: makeWrapper(mocks),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.car).toBeNull();

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeUndefined();
    expect(result.current.car).toMatchObject({
      id: "902",
      make: "Koenigsegg",
      model: "Jesko",
      year: 2023,
      color: "Ghost White",
    });
  });

  it("surfaces an error when the single-car query fails", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CAR, variables: { id: "does-not-exist" } },
        error: new Error("Car with id does-not-exist not found"),
      },
    ];

    const { result } = renderHook(() => useCar("does-not-exist"), {
      wrapper: makeWrapper(mocks),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeDefined();
    expect(result.current.error?.message).toContain(
      "Car with id does-not-exist not found"
    );
    expect(result.current.car).toBeNull();
  });
});

describe("useAddCar", () => {
  function useInventory() {
    const list = useCars();
    const adder = useAddCar();
    return { list, adder };
  }

  it("submits make/model/year/color, resolves with the created car and refreshes the list", async () => {
    const mocks: MockedResponse[] = [
      {
        request: { query: GET_CARS },
        result: { data: { cars: [rimac] } },
      },
      {
        request: {
          query: ADD_CAR,
          variables: {
            make: "Pagani",
            model: "Huayra",
            year: 2021,
            color: "Carbon Blue",
          },
        },
        result: { data: { addCar: pagani } },
      },
      {
        request: { query: GET_CARS },
        result: { data: { cars: [rimac, pagani] } },
      },
    ];

    const { result } = renderHook(() => useInventory(), {
      wrapper: makeWrapper(mocks),
    });

    await waitFor(() => expect(result.current.list.loading).toBe(false));
    expect(result.current.list.cars).toHaveLength(1);
    expect(
      result.current.list.cars.some((car) => car.model === "Huayra")
    ).toBe(false);
    expect(result.current.adder.loading).toBe(false);

    let created: Car | null | undefined;
    await act(async () => {
      created = await result.current.adder.addCar({
        make: "Pagani",
        model: "Huayra",
        year: 2021,
        color: "Carbon Blue",
      });
    });

    expect(created).toMatchObject({
      id: "903",
      make: "Pagani",
      model: "Huayra",
      year: 2021,
      color: "Carbon Blue",
    });
    expect(result.current.adder.error).toBeUndefined();

    await waitFor(() =>
      expect(result.current.list.cars).toHaveLength(2)
    );
    expect(result.current.list.cars.map((car) => car.model)).toEqual([
      "Nevera",
      "Huayra",
    ]);
    await waitFor(() => expect(result.current.adder.loading).toBe(false));
  });
});