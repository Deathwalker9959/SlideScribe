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
  audioSettings: Record<string, any> = {};

  constructor(name: string) {
    this.name = name;
  }

  delete() {
    this.deleted = true;
  }

  load() {
    return this;
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
    const createdShape: { name?: string; audioSettings?: Record<string, any>; load?: () => any } = {
      name: '',
      audioSettings: {},
      load() {
        return this;
      },
    };
    this.operations.push({ slideNumber: this.slideNumber, base64, options, shape: createdShape });
    return createdShape;
  }
}

class FakeSlide {
  shapes: FakeShapesCollection;
   width = 800;
   height = 600;

  constructor(slideNumber: number, operations: Operation[]) {
    this.shapes = new FakeShapesCollection(slideNumber, operations);
  }
}

async function runSmokeTest() {
  const fetchCalls: string[] = [];
  const { prepared, failedSlides } = await prepareSlideAudioSources(
    [
      { slideId: 'slide-1', slideNumber: 1, audioUrl: 'https://audio/slide-1.mp3' },
      { slideId: 'slide-2', slideNumber: 2, audioUrl: 'https://audio/slide-2.mp3' },
      { slideId: 'slide-3', slideNumber: 3, audioUrl: null },
    ],
    async (audioUrl) => {
      fetchCalls.push(audioUrl);
      return `BASE64_${audioUrl}`;
    }
  );

  if (prepared.length !== 2) {
    throw new Error(`Expected 2 prepared slides, received ${prepared.length}`);
  }
  if (prepared[0].slideNumber !== 1 || prepared[0].base64 !== 'BASE64_https://audio/slide-1.mp3') {
    throw new Error('Prepared slide 1 data is incorrect');
  }
  if (prepared[1].slideNumber !== 2 || prepared[1].base64 !== 'BASE64_https://audio/slide-2.mp3') {
    throw new Error('Prepared slide 2 data is incorrect');
  }
  if (failedSlides.length !== 0) {
    throw new Error(`Expected 0 failed slides, received ${failedSlides.join(', ')}`);
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

  if (operations.length !== 2) {
    throw new Error(`Expected 2 embed operations, received ${operations.length}`);
  }
  if (operations[0].slideNumber !== 1 || operations[1].slideNumber !== 2) {
    throw new Error(`Expected audio to embed on slides 1 and 2, received ${operations.map(o => o.slideNumber).join(', ')}`);
  }
  if (operations[0].base64 !== 'BASE64_https://audio/slide-1.mp3' || operations[1].base64 !== 'BASE64_https://audio/slide-2.mp3') {
    throw new Error('Embedded audio base64 payload is incorrect.');
  }
  if ((operations[0].options as any)?.embed !== true || (operations[1].options as any)?.embed !== true) {
    throw new Error('Embed options did not set the Office.js embed flag.');
  }
  const renamedCorrectly =
    operations[0].shape.name?.startsWith(`SlideScribeNarration_${operations[0].slideNumber}`) &&
    operations[1].shape.name?.startsWith(`SlideScribeNarration_${operations[1].slideNumber}`);
  if (!renamedCorrectly) {
    throw new Error('Embedded audio shape was not renamed to the SlideScribe convention.');
  }

  const shape1 = slides[0].shapes.items[0];
  const shape2 = slides[1].shapes.items[0];
  if (!shape1.deleted || !shape2.deleted) {
    throw new Error('Existing narration placeholder was not removed before embedding.');
  }

  console.log('embedNarration smoke test passed');
}

runSmokeTest().catch((error) => {
  console.error(error);
  process.exit(1);
});
