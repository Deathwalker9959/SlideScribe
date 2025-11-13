import { embedPreparedSlideAudio, prepareSlideAudioSources } from '../src/taskpane/utils/embedNarration';

type Operation = {
  slideNumber: number;
  base64: string;
  options: Record<string, unknown>;
  shape: { name?: string };
};

class FakeShape {
  name: string;
  deleted = false;

  constructor(name: string) {
    this.name = name;
  }

  delete() {
    this.deleted = true;
  }
}

class FakeShapesCollection {
  items: FakeShape[];
  operations: Operation[];
  slideNumber: number;

  constructor(slideNumber: number, operations: Operation[]) {
    this.items = [new FakeShape(`SlideScribeNarration_${slideNumber}`)];
    this.operations = operations;
    this.slideNumber = slideNumber;
  }

  load() {
    // no-op for test double
  }

  addAudio(base64: string, options: Record<string, unknown>) {
    const createdShape: { name?: string } = { name: '' };
    this.operations.push({ slideNumber: this.slideNumber, base64, options, shape: createdShape });
    return createdShape;
  }
}

class FakeSlide {
  shapes: FakeShapesCollection;

  constructor(slideNumber: number, operations: Operation[]) {
    this.shapes = new FakeShapesCollection(slideNumber, operations);
  }
}

async function runSmokeTest() {
  const fetchCalls: string[] = [];
  const { prepared, failedSlides } = await prepareSlideAudioSources(
    [
      { slideId: 'slide-1', slideNumber: 1, audioUrl: 'https://audio/slide-1.mp3' },
      { slideId: 'slide-2', slideNumber: 2, audioUrl: null },
      { slideId: 'slide-3', slideNumber: 3, audioUrl: 'https://audio/missing.mp3' },
    ],
    async (audioUrl) => {
      fetchCalls.push(audioUrl);
      if (audioUrl.includes('missing')) {
        throw new Error('Fetch failed');
      }
      return `BASE64_${audioUrl}`;
    }
  );

  if (prepared.length !== 1) {
    throw new Error(`Expected 1 prepared slide, received ${prepared.length}`);
  }
  if (prepared[0].slideNumber !== 1 || prepared[0].base64 !== 'BASE64_https://audio/slide-1.mp3') {
    throw new Error('Prepared slide data is incorrect');
  }
  if (failedSlides.length !== 1 || failedSlides[0] !== 3) {
    throw new Error(`Expected slide 3 to fail, received ${failedSlides.join(', ')}`);
  }
  if (fetchCalls.length !== 2) {
    throw new Error(`Expected fetchAudio to be called twice, received ${fetchCalls.length}`);
  }

  const operations: Operation[] = [];
  const slides = [new FakeSlide(1, operations), new FakeSlide(2, operations), new FakeSlide(3, operations)];

  const powerPointStub = {
    async run(callback: (context: any) => Promise<void> | void) {
      const context = {
        presentation: {
          slides: {
            items: slides,
            load: () => {},
          },
        },
        sync: async () => {},
      };
      await callback(context);
    },
  };

  await embedPreparedSlideAudio(powerPointStub, prepared);

  if (operations.length !== 1) {
    throw new Error(`Expected 1 embed operation, received ${operations.length}`);
  }
  if (operations[0].slideNumber !== 1) {
    throw new Error(`Expected audio to embed on slide 1, received ${operations[0].slideNumber}`);
  }
  if (operations[0].base64 !== 'BASE64_https://audio/slide-1.mp3') {
    throw new Error('Embedded audio base64 payload is incorrect.');
  }
  if ((operations[0].options as any)?.embed !== true) {
    throw new Error('Embed options did not set the Office.js embed flag.');
  }
  if (operations[0].shape.name !== `SlideScribeNarration_${operations[0].slideNumber}`) {
    throw new Error('Embedded audio shape was not renamed to the SlideScribe convention.');
  }

  const shape = slides[0].shapes.items[0];
  if (!shape.deleted) {
    throw new Error('Existing narration placeholder was not removed before embedding.');
  }

  console.log('embedNarration smoke test passed');
}

runSmokeTest().catch((error) => {
  console.error(error);
  process.exit(1);
});
