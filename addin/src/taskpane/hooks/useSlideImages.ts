import { useCallback, useEffect, useState } from "react";

type SlideImagePreview = {
  slideNumber: number;
  imageIndex: number;
  base64: string;
  format: string;
  width?: number;
  height?: number;
  name?: string;
};

type UseSlideImagesResult = {
  images: SlideImagePreview[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useSlideImages(autoLoad = true): UseSlideImagesResult {
  const [images, setImages] = useState<SlideImagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof PowerPoint === "undefined" || typeof PowerPoint.run !== "function") {
      setImages([]);
      setError("PowerPoint runtime unavailable. Open inside PowerPoint to preview slide images.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await PowerPoint.run(async (context) => {
        const slides = context.presentation.slides;
        slides.load("items");
        await context.sync();

        const collected: SlideImagePreview[] = [];

        for (let i = 0; i < slides.items.length; i++) {
          const slide = slides.items[i];
          const shapes = slide.shapes;
          shapes.load("items/type,items/name,items/width,items/height");
          await context.sync();

          let imageCount = 0;
          shapes.items.forEach((shape: any) => {
            if (shape.type === "Image") {
              imageCount += 1;
              collected.push({
                slideNumber: i + 1,
                imageIndex: imageCount,
                base64: "placeholder-base64-data",
                format: "png",
                width: shape.width,
                height: shape.height,
                name: shape.name,
              });
            }
          });
        }

        setImages(collected);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Unable to load slide images: ${message}`);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  return { images, loading, error, refresh };
}
