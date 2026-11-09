/** Dougie, the deadpan commentator. */
const LINES: Record<string, string[]> = {
  intro: [
    "Welcome tae the Royal Mile. Please keep yer hands, feet and dignity inside the trolley.",
    "Today's conditions: dreich, wi' a chance o' carnage.",
  ],
  aim: ["Line it up. Or don't. The council's insured. Probably.", "Take yer time. The haar's no' going anywhere."],
  launch_good: ["Oh, that's a peach of a swing!", "Straight down the middle! Hamish is away!", "Textbook. Absolutely textbook."],
  launch_over: ["He's absolutely leathered it!", "That's too much welly. Far too much welly.", "Somebody tell the hospital tae put the kettle on."],
  launch_weak: ["That's... a gentle nudge. Very gentle.", "My granny swings harder than that, and she's ninety-three."],
  launch_hook: ["Hooked it! He's heading for the shops!", "That's a slice, and a bad one."],
  hit: ["That'll be coming out of yer deposit.", "Lovely contact.", "That was listed, by the way.", "Smashing. Literally.", "Oof. Historic.", "The tourists loved that."],
  big: ["OH, YA BEAUTY!", "Did ye SEE that?!", "That's going on the postcards!", "Pure carnage. Magnificent."],
  combo: ["He's on a rampage!", "Combo! The man's a menace!", "Somebody stop him. Actually, don't."],
  tourist: ["Sorry pal! Enjoy the rest of yer holiday!", "That'll be a lovely story for back home.", "He'll be fine. Probably got travel insurance.", "Ach, he walked intae that."],
  pigeon: ["The pigeons have filed a complaint.", "Feathers everywhere! Like a burst pillow!", "Those pigeons were union, ye know."],
  eject: ["HAMISH HAS LEFT THE TROLLEY!", "Man overboard! Kilt... also overboard!", "And he's airborne! Nobody look up!", "That's an ejection! Ten out of ten for style!"],
  flip: ["She's over! The trolley's turned turtle!", "Upside down and out he goes!"],
  chase: ["He's up! He's chasing it! Run, Hamish, run!", "Look at him go! Kilt flapping in the breeze!", "That's the fastest he's moved since last orders!", "He wants his trolley back!"],
  reboard: ["And he's back in! What a recovery!", "Back in the trolley! The crowd goes mild!", "Hamish has re-boarded. Health and safety have left the building."],
  airtime: ["Kilt lift! Avert yer eyes!", "Big air! The answer tae the age-old question is... no comment.", "He's flying! Somebody call air traffic control!"],
  barrels: ["Not the whisky! Anything but the whisky!", "That's eighteen-year-old single malt all over the cobbles. I may weep.", "Barrel bowling! Strike!"],
  piper: ["He's flattened the piper! The pipes are deflating!", "That's the saddest noise I've ever heard. And I've heard the pipes."],
  shop: ["Ye break it, ye bought it. Ye bought a LOT.", "Window shopping! Through the window!"],
  spire: ["THE CROWN! He's brought down the crown of St Giles'!", "Six hundred years that stood! Six hundred!", "That's the jackpot! Someone phone Historic Environment Scotland!"],
  smith: [
    "That's the invisible hand of the market... giving Adam a shove!",
    "Adam Smith, toppled. The market has spoken.",
    "Supply of statues: down. Demand: unchanged. Basic economics.",
    "He did say everyone acts in their own self-interest. Yours was knocking him over.",
    "A textbook market correction. Literally. He wrote the textbook.",
  ],
  mercat: ["The unicorn's down! Our national animal, toppled!", "Mercat Cross has been... well, crossed."],
  heart: ["He's rolled over the Heart and didnae spit. That's bad luck, son.", "Ye've got tae spit on it! It's tradition!"],
  heart_spit: ["Landed right on the Heart! That's the luckiest bounce in Edinburgh!", "Bang on the Heart! Good luck for a year, apparently."],
  fringe: ["Fringe benefit! Best reviewed show this year.", "That's the most audience participation this stage has ever seen.", "Five stars! 'Unmissable' — The Scotsman, probably."],
  stall: ["Haggis everywhere! It's a haggis hurricane!", "Clean-up on aisle Royal Mile!"],
  haggis: ["HAGGIS HAT-TRICK! The wee beasties never stood a chance!"],
  phonebox: ["He's rung the phone box! Reverse charges!"],
  wall: ["Through the World's End wall! It was the end of the world for that wall!", "Bricks everywhere! Did he no' see the wall?!"],
  clock: ["He's clocked the clock!", "Time's up for the Tolbooth clock!"],
  gates: ["Through the palace gates! The King'll be furious!", "He's made it tae Holyrood! Someone get him a scone!"],
  finish: ["That's the bottom of the Mile! What a run!", "He made it! Against all common sense!"],
  stopped: ["And he's... stopped. Well. That's that then.", "Out of steam. Like the rest of us."],
  wreck: ["It's a write-off. The trolley, the street, everything."],
  results: ["The council will be in touch.", "Same time tomorrow?"],
  brew: ["IRN BREW! Scotland's other national drink!", "Made from girders! He's away!", "That's the sugar kicking in! Hold on tae yer kilt!", "One can and he's flying! Imagine two!"],
  // the Big Boot
  boot: ["THE BOOT HAS SPOKEN!", "Right up the jacksie!", "That's a size forty-seven, that.", "Ye've been booted, son!"],
  intro_long: [
    "The Royal Mile's shut for roadworks. Again. Follow the diversion signs, if ye can read at that speed.",
    "Today's route: down tae the Grassmarket, up tae Princes Street, and on tae Leith. The Forth is not a car park.",
  ],
  // engines and the long course
  diversion: ["DIVERSION! Hard right down George IV Bridge!", "The Royal Mile's closed! Right turn, right now!"],
  engine_blower: ["He's pulled the cord! Leaf blower ENGAGED!", "Listen tae that two-stroke! The neighbours will love it."],
  engine_scooter: ["Granny's scooter is up tae... four miles an hour. No, wait, he's took the limiter off!", "Mobility scooter, full beans!"],
  engine_buggy: ["The buggy's away! Fore!", "Electric golf buggy, unleashed on the public highway!"],
  engine_outboard: ["He's started the outboard. On a road. In a bath.", "The bathtub's got a motor! Of course it has!"],
  stalled: ["No engine and nae hill. That's that, then.", "He's run out o' downhill!"],
  grassmarket: ["Into the Grassmarket! Mind the drinkers!", "The beer garden's open. Not for long."],
  pints: ["That's a lot of spilt pints. There'll be a riot.", "Somebody's going tae want a refill."],
  covenanters: ["Not the Covenanters' Memorial! Have ye no respect?", "Four hundred years o' history and a trolley."],
  warden: ["He's flattened the traffic warden! The whole city cheers!", "That's the most popular thing anyone's ever done in Edinburgh."],
  cars: ["Car alarm! Car alarm everywhere!", "Ye'll no' get a parking space like that."],
  caley: ["Round the Caley! Mind the doorman!"],
  tram: ["THE TRAM! He's been hit by a tram!", "Trams: late, expensive, and absolutely unstoppable.", "That tram took fifteen years tae build and two seconds tae hit ye."],
  wheel: ["THE BIG WHEEL'S LOOSE! RUN!", "The big wheel is rolling down Princes Street! This is not a drill!", "That's the most the big wheel has moved in years!"],
  market: ["Mulled wine everywhere! Christmas is cancelled!", "He's ploughed through the Christmas market. Bah, humbug."],
  scott: ["There's the Scott Monument. Looks like a gothic rocket. Probably is."],
  balmoral: ["The Balmoral clock's always three minutes fast. So's he."],
  walnut: ["There's the Walnut Whip. Locals hate it. Tourists photograph it. Nobody eats it."],
  tramworks: ["Tram works! They were meant tae be finished in 2014!", "Cones! Cones as far as the eye can see!"],
  victoria: ["QUEEN VICTORIA IS NOT AMUSED!", "Her Majesty has been toppled! We are definitely not amused!"],
  lighthouse: ["Newhaven Lighthouse! The sea's next! Somebody stop him!"],
  splash: ["SPLASHDOWN! Into the Forth he goes!", "He's in the sea! And so is the vehicle! And the dignity!", "That's the Firth of Forth! It's freezing! Nobody tell his mother!"],
  sinking: ["Glug glug glug.", "And down she goes. Like the Titanic, but in Leith."],
  finish_gm: ["That's the Grassmarket! End of the line... for now.", "Road closed! That's as far as the council lets ye go."],
  finish_ps: ["Princes Street conquered! The East End's closed beyond. Unlock more, son."],
};

export class Commentary {
  private el = document.getElementById('commentary')!;
  private span = this.el.querySelector('span') as HTMLElement;
  private last = -10;
  private hideAt = 0;
  private recent: string[] = [];
  private time = 0;

  say(key: string, force = false) {
    const lines = LINES[key];
    if (!lines) return;
    if (!force && this.time - this.last < 2.6) return;
    const pool = lines.filter((l) => !this.recent.includes(l));
    const line = (pool.length ? pool : lines)[Math.floor(Math.random() * (pool.length || lines.length))];
    this.recent.push(line);
    if (this.recent.length > 12) this.recent.shift();
    this.show(line);
  }

  show(text: string, dur = 3.4) {
    this.span.textContent = text;
    this.el.classList.add('show');
    this.last = this.time;
    this.hideAt = this.time + dur;
  }

  /** Chance-based line so not every hit gets a quip. */
  maybe(key: string, chance: number) {
    if (Math.random() < chance) this.say(key);
  }

  update(dt: number) {
    this.time += dt;
    if (this.hideAt && this.time > this.hideAt) {
      this.el.classList.remove('show');
      this.hideAt = 0;
    }
  }

  hide() {
    this.el.classList.remove('show');
    this.hideAt = 0;
  }
}
