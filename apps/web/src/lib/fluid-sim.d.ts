export type FluidHandle = {
  setPaused: (value: boolean) => void;
  stop: () => void;
};

export type FluidOptions = { ambient?: boolean; lowPower?: boolean };

export function startFluid(canvas: HTMLCanvasElement, options?: FluidOptions): FluidHandle;
