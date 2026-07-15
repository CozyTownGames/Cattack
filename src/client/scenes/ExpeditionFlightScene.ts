import * as Phaser from 'phaser';
import { emitSceneChanged } from '../eventBus';
import { gameStore } from '../../shared/gameStore';
import type { ExpeditionMapId } from '../../shared/expedition';

type FlightChoice = {
  label: string;
  result: string;
  mapId: ExpeditionMapId;
  color: number;
};

type FlightEvent = {
  prompt: string;
  choices: [FlightChoice, FlightChoice];
};

const FLASH_WORD_EXCLUSIONS = new Set([
  'ABOUT', 'AFTER', 'AGAIN', 'ALONG', 'BEFORE', 'BEHIND', 'BEGINNING', 'COURSE',
  'EVERY', 'FOLLOWING', 'LANDING', 'NEAREST', 'SETTING', 'SOMEBODY', 'SOMETHING',
  'STARTED', 'THEIR', 'THERE', 'THEY', 'THIS', 'THROUGH', 'TOWARD', 'UNTIL', 'VERY',
  'WHILE', 'WITH', 'YOUR',
]);

const pickFlashWord = (content: string): string => {
  const words = content.match(/[A-Z0-9-]+/g) ?? [];
  return words
    .filter((word) => word.length >= 5 && !FLASH_WORD_EXCLUSIONS.has(word))
    .sort((a, b) => b.length - a.length)[0]
    ?? words.sort((a, b) => b.length - a.length)[0]
    ?? '';
};

const FLIGHT_EVENTS: FlightEvent[] = [
  {
    prompt: 'A GROUP OF INVADERS HAVE SURROUNDED THE SHIP!\nTHEIR ROARING MEOWS MAKE THE CARGO HULL SHAKE!',
    choices: [
      {
        label: 'THROW SOME FOOD AT THEM',
        result: 'THEY ENJOYED THE SNACK A LITTLE TOO MUCH\nAND ATE EVERYTHING! TIME TO MAKE A PIT STOP...',
        mapId: 'grocery',
        color: 0xf59e0b,
      },
      {
        label: 'FLY OUT AND TRY TO SAY HELLO',
        result: 'THE GREETING DID NOT GO AS PLANNED.\nYOU NEED MEDICAL SUPPLIES BEFORE EXPLORING.',
        mapId: 'medical',
        color: 0x38bdf8,
      },
    ],
  },
  {
    prompt: 'A STRANGE SIGNAL CUTS THROUGH THE STATIC.\nIT SOUNDS LIKE MUSIC PLAYING BENEATH THE PLANET!',
    choices: [
      {
        label: 'FOLLOW THE NEON SIGNAL',
        result: 'THE SIGNAL LEADS TO A POWERED ARCADE.\nSETTING A COURSE FOR THE NEON LIGHTS...',
        mapId: 'arcade',
        color: 0xa855f7,
      },
      {
        label: 'TRACE THE SIGNAL UNDERGROUND',
        result: 'THE TRANSMISSION IS COMING FROM BELOW.\nLANDING NEAR A SEWER ACCESS POINT...',
        mapId: 'sewer',
        color: 0x22c55e,
      },
    ],
  },
  {
    prompt: 'A CHORUS OF PURRS ECHOES THROUGH THE COMMS.\nA CAT-ALIEN BEACON IS INVITING YOU TO LAND!',
    choices: [
      {
        label: 'ANSWER THE CAT-ALIEN BEACON',
        result: 'THE SIGNAL BLOOMS INTO A CONSTELLATION OF PAW PRINTS.\nLANDING ON THE MYSTERIOUS CAT PLANET...',
        mapId: 'planet',
        color: 0xff4fd8,
      },
      {
        label: 'FOLLOW THE SUPPLY FREQUENCY',
        result: 'THE PURRS FADE BEHIND A STRONG SUPPLY SIGNAL.\nSETTING A COURSE FOR THE GROCERY OUTPOST...',
        mapId: 'grocery',
        color: 0xf59e0b,
      },
    ],
  },
  {
    prompt: 'THE SHIP COMPUTER HAS DETECTED A RED DOT IN SPACE.\nIT REFUSES TO CONTINUE UNTIL SOMEBODY CATCHES IT!',
    choices: [
      {
        label: 'CHASE THE RED DOT',
        result: 'THE DOT DARTS INTO A NEON BUILDING.\nTHE COMPUTER PURRS: TARGET ACQUIRED. LANDING...',
        mapId: 'arcade',
        color: 0xa855f7,
      },
      {
        label: 'TURN THE LASER POINTER OFF',
        result: 'THE COMPUTER SULKS AND ORDERS EMERGENCY TREATS.\nDIVERTING TO THE GROCERY OUTPOST...',
        mapId: 'grocery',
        color: 0xf59e0b,
      },
    ],
  },
  {
    prompt: 'ZERO-G CAT HAIR HAS CLOGGED THE LIFE-SUPPORT VENTS.\nTHE SHIP IS NOW 40% FLUFF AND 60% PANIC!',
    choices: [
      {
        label: 'FIND A SPACE VETERINARIAN',
        result: 'A MEDICAL BEACON OFFERS INDUSTRIAL-STRENGTH LINT ROLLERS.\nBEGINNING AN EXTREMELY FLUFFY LANDING...',
        mapId: 'medical',
        color: 0x38bdf8,
      },
      {
        label: 'FLUSH IT THROUGH THE PIPES',
        result: 'THE CLOG ESCAPES, BUT SO DOES SOMETHING WITH WHISKERS.\nFOLLOWING IT INTO THE SEWER ACCESS...',
        mapId: 'sewer',
        color: 0x22c55e,
      },
    ],
  },
  {
    prompt: 'A TINY UFO PULLS ALONGSIDE YOUR SHIP.\nITS CAT-ALIEN PILOT IS HONKING A RUBBER MOUSE!',
    choices: [
      {
        label: 'HONK A TOY BACK',
        result: 'THE PILOT SALUTES WITH BOTH EARS AND OPENS A PAW-SHAPED PORTAL.\nFOLLOWING THEM HOME...',
        mapId: 'planet',
        color: 0xff4fd8,
      },
      {
        label: 'CHALLENGE THEM TO A GAME',
        result: 'THE PILOT ACCEPTS, THEN IMMEDIATELY CLAIMS PLAYER ONE.\nLANDING AT THE NEAREST ARCADE...',
        mapId: 'arcade',
        color: 0xa855f7,
      },
    ],
  },
  {
    prompt: 'THE NAVIGATION CAT HAS SAT ON THE CONTROLS.\nTWO DESTINATIONS REMAIN UNDER ITS VERY ROUND BOTTOM!',
    choices: [
      {
        label: 'SCRITCH BEHIND ITS LEFT EAR',
        result: 'THE CAT LEANS LEFT AND ACCIDENTALLY ORDERS 900 TINS OF TUNA.\nCOURSE SET FOR THE GROCERY OUTPOST...',
        mapId: 'grocery',
        color: 0xf59e0b,
      },
      {
        label: 'SCRITCH BEHIND ITS RIGHT EAR',
        result: 'THE CAT LEANS RIGHT AND OPENS A VERY SUSPICIOUS DRAIN MAP.\nDESCENDING TOWARD THE SEWERS...',
        mapId: 'sewer',
        color: 0x22c55e,
      },
    ],
  },
  {
    prompt: 'AN ANCIENT SPACE CAPSULE DRIFTS PAST.\nINSIDE, A CAT IS STILL KNOCKING THE SAME CUP OFF A TABLE!',
    choices: [
      {
        label: 'RESCUE THE CAT',
        result: 'THE CAT IS FINE. THE CUP NEEDS URGENT CARE.\nESCORTING BOTH TO THE MEDICAL STATION...',
        mapId: 'medical',
        color: 0x38bdf8,
      },
      {
        label: 'ASK WHERE IT CAME FROM',
        result: 'IT POINTS WITH ONE PAW TOWARD A GLOWING FELINE WORLD.\nFOLLOWING THE PAW TO THE CAT PLANET...',
        mapId: 'planet',
        color: 0xff4fd8,
      },
    ],
  },
  {
    prompt: 'YOUR TUNA-FUELED WARP DRIVE HAS STARTED MEOWING BACKWARDS.\nTHE MANUAL ONLY SAYS: DO NOT PET WHILE ACTIVE.',
    choices: [
      {
        label: 'PET THE WARP DRIVE',
        result: 'THE ENGINE PURRS, ROLLS OVER, AND OPENS A NEON WORMHOLE.\nTUMBLING TOWARD THE ARCADE...',
        mapId: 'arcade',
        color: 0xa855f7,
      },
      {
        label: 'OFFER IT A SNACK',
        result: 'THE ENGINE EATS THE ENTIRE FUEL RESERVE.\nGLIDING POWERLESSLY TOWARD GROCERIES...',
        mapId: 'grocery',
        color: 0xf59e0b,
      },
    ],
  },
  {
    prompt: 'A MOON-SIZED BALL OF YARN IS BLOCKING THE FLIGHT PATH.\nSOMETHING ENORMOUS IS BATTING IT TOWARD YOU!',
    choices: [
      {
        label: 'FOLLOW THE GIANT YARN',
        result: 'THE TRAIL LEADS TO COLOSSAL PAW PRINTS AND ALIEN PURRS.\nPREPARING TO LAND ON THE CAT PLANET...',
        mapId: 'planet',
        color: 0xff4fd8,
      },
      {
        label: 'HIDE IN THE NEAREST TUNNEL',
        result: 'THE TUNNEL IS DAMP, DARK, AND WEIRDLY FULL OF RUBBER MICE.\nLANDING BY THE SEWER ENTRANCE...',
        mapId: 'sewer',
        color: 0x22c55e,
      },
    ],
  },
];

let lastFlightEventIndex = -1;

export class ExpeditionFlightScene extends Phaser.Scene {
  private stars!: Phaser.GameObjects.TileSprite;
  private ship!: Phaser.GameObjects.Image;
  private eventPanel!: Phaser.GameObjects.Container;
  private travelling = false;

  constructor() { super('ExpeditionFlightScene'); }

  private createFlashingText(
    x: number,
    y: number,
    content: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const measuringText = this.add.text(0, 0, content, style).setOrigin(0.5);
    const flashWord = pickFlashWord(content);
    const wrappedLines = measuringText.getWrappedText(content);
    const lineIndex = wrappedLines.findIndex((line) => line.includes(flashWord));
    const lineHeight = measuringText.height / wrappedLines.length;
    const totalHeight = measuringText.height;
    const lineWidths = wrappedLines.map((line) => measuringText.context.measureText(line).width);
    const prefix = lineIndex >= 0 ? (wrappedLines[lineIndex] ?? '').split(flashWord)[0] ?? '' : '';
    const prefixWidth = measuringText.context.measureText(prefix).width;
    const wordWidth = measuringText.context.measureText(flashWord).width;
    measuringText.destroy();

    let magentaWord: Phaser.GameObjects.Text | null = null;
    let yellowWord: Phaser.GameObjects.Text | null = null;
    wrappedLines.forEach((line, index) => {
      const lineY = -totalHeight / 2 + lineHeight * (index + 0.5);
      if (index !== lineIndex || !flashWord) {
        container.add(this.add.text(0, lineY, line, style).setOrigin(0.5));
        return;
      }

      const lineStartX = -(lineWidths[index] ?? 0) / 2;
      const suffix = line.slice(prefix.length + flashWord.length);
      container.add(this.add.text(lineStartX, lineY, prefix, style).setOrigin(0, 0.5));
      magentaWord = this.add.text(lineStartX + prefixWidth, lineY, flashWord, { ...style, color: '#ff00ff' }).setOrigin(0, 0.5);
      yellowWord = this.add.text(lineStartX + prefixWidth, lineY, flashWord, { ...style, color: '#ffff00' }).setOrigin(0, 0.5).setAlpha(0);
      container.add([
        magentaWord,
        yellowWord,
        this.add.text(lineStartX + prefixWidth + wordWidth, lineY, suffix, style).setOrigin(0, 0.5),
      ]);
    });

    if (!magentaWord || !yellowWord) return container;
    this.tweens.add({ targets: magentaWord, alpha: 0, duration: 110, yoyo: true, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: yellowWord, alpha: 1, duration: 110, yoyo: true, repeat: -1, ease: 'Linear' });
    return container;
  }

  private addNeonWindow(
    container: Phaser.GameObjects.Container,
    width: number,
    height: number
  ): void {
    container.add(this.add.rectangle(-6, -6, width, height, 0x080b1c, 0)
      .setStrokeStyle(4, 0xffbb00));
    container.add(this.add.rectangle(6, 6, width, height, 0x080b1c, 0)
      .setStrokeStyle(4, 0xff00ff));
    container.add(this.add.rectangle(0, 0, width, height, 0x080b1c, 0.98)
      .setStrokeStyle(4, 0x00ffee));
  }

  preload(): void {
    const v = Date.now();
    this.load.image('expedition_space', `space/space_tile.png?v=${v}`);
    this.load.image('expedition_ship', `images/player.png?v=${v}`);
  }

  create(): void {
    emitSceneChanged({ scene: 'ExpeditionFlight' });
    const { width, height } = this.scale;
    this.stars = this.add.tileSprite(0, 0, width, height, 'expedition_space').setOrigin(0);
    this.ship = this.add.image(width * 0.16, height * 0.5, 'expedition_ship').setScale(2).setAngle(90);

    const availableEventIndexes = FLIGHT_EVENTS
      .map((_event, index) => index)
      .filter((index) => index !== lastFlightEventIndex);
    const flightEventIndex = Phaser.Math.RND.pick(availableEventIndexes);
    lastFlightEventIndex = flightEventIndex;
    const flightEvent = FLIGHT_EVENTS[flightEventIndex] ?? FLIGHT_EVENTS[0]!;
    this.showEvent(flightEvent);
  }

  private showEvent(flightEvent: FlightEvent): void {
    const { width, height } = this.scale;
    this.eventPanel = this.add.container(width / 2, height / 2);
    this.addNeonWindow(this.eventPanel, Math.min(width - 32, 600), 300);
    const prompt = this.createFlashingText(0, -88, flightEvent.prompt, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(width - 70, 520) },
      lineSpacing: 7,
    });
    this.eventPanel.add(prompt);

    flightEvent.choices.forEach((choice, index) => {
      const y = 25 + index * 66;
      const button = this.add.rectangle(0, y, Math.min(width - 80, 460), 48, choice.color, 0.95)
        .setStrokeStyle(2, 0xffffff)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(0, y, choice.label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', align: 'center',
      }).setOrigin(0.5);
      button.on('pointerover', () => button.setScale(1.03));
      button.on('pointerout', () => button.setScale(1));
      button.on('pointerdown', () => this.showResult(choice));
      this.eventPanel.add([button, label]);
    });
  }

  private showResult(choice: FlightChoice): void {
    if (this.travelling) return;
    this.eventPanel.destroy(true);
    const { width, height } = this.scale;
    const panel = this.add.container(width / 2, height / 2);
    this.addNeonWindow(panel, Math.min(width - 32, 580), 235);
    const result = this.createFlashingText(0, -42, choice.result, {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(width - 70, 500) },
      lineSpacing: 7,
    });
    const okButton = this.add.rectangle(0, 65, 150, 45, choice.color, 0.95)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    const okText = this.add.text(0, 65, 'OK', { fontFamily: 'monospace', fontSize: '18px', color: '#ffffff' }).setOrigin(0.5);
    okButton.on('pointerover', () => okButton.setScale(1.05));
    okButton.on('pointerout', () => okButton.setScale(1));
    okButton.on('pointerdown', () => {
      panel.destroy(true);
      this.beginLanding(choice.mapId);
    });
    panel.add([result, okButton, okText]);
  }

  private beginLanding(mapId: ExpeditionMapId): void {
    if (this.travelling) return;
    this.travelling = true;
    gameStore.expeditionMap = mapId;
    this.tweens.add({ targets: this.ship, x: this.scale.width + 120, duration: 900, ease: 'Cubic.easeIn' });
    this.time.delayedCall(900, () => this.scene.start('ExplorationScene', { mapId }));
  }

  override update(): void {
    if (this.stars) this.stars.tilePositionX += this.travelling ? 18 : 2;
  }
}
