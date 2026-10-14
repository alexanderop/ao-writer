import type { PosTag } from './tagger.ts'

/**
 * Plain word data for the part-of-speech tagger. Everything here is written by
 * hand from general knowledge of English. Words are lower case; inflected forms
 * of regular words (plurals, -ed, -ing, -er, -est, -ly) are derived by the tagger,
 * so only base forms and irregular forms are listed.
 */

function words(list: string): readonly string[] {
  return list.trim().split(/\s+/)
}

type TagGroup = readonly [readonly PosTag[], readonly string[]]

/** Words with more than one plausible tag. The tags are ordered most likely first. */
const AMBIGUOUS: readonly TagGroup[] = [
  [
    ['det', 'pron'],
    words(`that this these those some any all both either neither another each many much few
      enough more most less least several what which whose`),
  ],
  [['pron', 'adj'], words('other')],
  [['num', 'pron'], words('one')],
  [['num', 'noun'], words('dozen couple half')],
  [['adj', 'adv'], words('first')],
  [['adj', 'noun'], words('second final last')],
  [
    ['prep', 'adv'],
    words(`about above across after along around before behind below beneath beside besides
      beyond down inside near off out outside over past through throughout underneath up
      within without`),
  ],
  [['prep', 'conj'], words('for since until till')],
  [['prep', 'conj', 'adv'], words('as')],
  [['prep', 'verb', 'conj'], words('like')],
  [['conj', 'adv'], words('so yet once')],
  [['conj', 'noun'], words('while')],
  [['adv', 'conj'], words('when where whenever wherever')],
  [['adv', 'adj'], words('still')],
  [['adv', 'adj', 'noun'], words('well')],
  [['adv', 'adj'], words('just pretty')],
  [['adj', 'adv'], words('long fast hard late early high low far straight right wrong deep')],
  [['verb', 'adj', 'adv'], words('close')],
  [['adv', 'noun', 'verb'], words('back')],
  [['adj', 'adv'], words('better best worse worst enough little')],
  [['adv', 'noun'], words('home today tomorrow yesterday tonight')],
  [['adv'], words('here')],
  [['adv', 'pron'], words('there')],
  [['adv', 'adj'], words('only')],
  [['adj', 'adv'], words('alone daily weekly monthly yearly')],
  [['verb', 'noun'], words('will can may need dare')],
  [['verb', 'adj'], words('done left known broken written chosen hidden forgotten frozen stolen spoken drawn fallen torn lost hurt shut born grown worn drunk sunk given taken seen gone shown')],
  [['verb', 'noun'], words('saw set rose')],
  [['verb', 'noun'], words('being')],
  [['noun', 'other'], words('thanks')],
  [['adj', 'other'], words('okay ok')],
  [['det', 'other'], words('no')],
  [['det', 'adj'], words('such')],
  [['adj', 'noun'], words('red blue green yellow black white brown grey gray orange purple pink golden silver')],
  [['adj', 'noun', 'verb'], words('light')],
  [['adj', 'noun'], words('fine private public quiet calm secret total final')],
  [['adj', 'verb'], words('open close clean clear dry empty cool warm slow')],
  [['noun', 'verb'], words(`lives leaves break work question plan change rest step test point mark name place report record
    form issue dream hope love look call cut show turn draft focus answer drink check sleep smile trust
    wish talk visit walk play fish hand house paint park rock sign sound store support touch train
    water wave dance design cook judge kiss laugh lock pass pick pull push reach ship spell stand stay
    study travel track rain wonder rule return use start stop end mind back book cause claim copy count
    cover cycle damage doubt escape fear figure guess guide heart help increase influence interest
    offer order pack plant practice promise process project protest quote rate reply request research
    result review risk roll rub run rush score search season shape share shift shop shower sink slide
    slip snap spot stick strike stress surprise swim switch tap taste tie tip top trade trick twist
    view vote wait watch whisper wind wrap edit post drop fall jump kick lift limit link list load
    measure mix move note notice object outline paper picture print press program race rank remark
    reward sketch slice smell address attack bank bend bet bill blame block blow board bother bow
    box brush bump burn cap care catch chat chart charge chase circle climb comment contact contest
    contract crash crop cross crowd curl dash date deal decrease demand display divide drag draw dress
    drive duty fix flag flash float flow fold fool force frame fund gain game gather gift grade grant
    grip group hang harm haul head heat hint hit hold hook host hunt hurry impact insult jam joke
    judge kick knock label lead leak lean leap level lie lend lift market match mess mind miss model
    murder nail name nest nod offer pace panel patch pattern pause peak peel plot pound pour praise
    present pride print prize pump punch purchase question rattle record reflect regard rent repair
    report rescue respect retreat reveal ring rise roar rob rock rope row ruin rule sail sample saw
    scale scare scratch screen seal seat second shade shadow shelter shine shock shout sigh signal
    silence skate ski skip slam sleep smoke snow sort spark spell spend spin split sponsor spray
    spread squeeze stake stamp stare state steal steer stir stitch stream stretch strip study stuff
    suit supply surround swing talk target taste tend thank thread threat thrill tour tower trace
    trap treat trial trouble trust tune turn twist type vary visit voice wake walk warn wash waste
    wear weigh whistle wipe wish wonder yell yield`)],
]

/** Verbs whose most likely reading is a verb, base forms only. */
const VERBS = words(`accept achieve act add admit adopt advise afford agree allow announce appear apply
  argue arrive ask assume attach attempt attend avoid bake beat become begin behave believe belong
  bite bless blow boil bore borrow bounce breathe bring build burst buy calculate capture carry choose
  clean combine come compare complain complete concern confirm connect consider consist contain
  continue contribute convince correct create cry decide declare deliver deny depend describe
  deserve destroy determine develop die disappear discover discuss disagree dislike do eat enable
  encourage enjoy enter establish examine exist expand expect experience explain express extend
  fail feed feel fight fill finish fit follow forget forgive gather get give go grab grow handle
  happen hate have hear hide hire hurt identify ignore imagine improve include indicate inform
  insist intend introduce invite involve join keep kill know lack last lay learn leave lend let
  listen live lose make manage mean meet mention miss obtain occur operate organize own participate
  pay perform permit pretend prefer prepare prevent produce prove provide publish put raise realize
  receive recognize recommend reduce refer refuse relate release remain remember remind remove repeat
  replace represent require rely respond rewrite revise read say see seem sell send settle shake
  shall should sing sit speak spend stand succeed suggest suppose survive take teach tell think throw
  understand unlock unfold update value want wear welcome win wonder worry write wrap accompany
  adjust analyze arrange assist assure bake behave bend betray blend bloom bounce brew bury capture
  celebrate chat chew clap collect command compose concentrate confess conquer construct convert
  crawl crush cure cut dance dare decorate defeat define delay delight depart deposit design destroy
  detect devote dig digest dine direct disturb dive donate doubt draft drift dwell earn edit embrace
  emerge emphasize employ empty encounter endure engage enhance ensure entertain erase escape
  evaluate evolve exceed exchange excuse exercise exhibit expose fade fasten fetch figure flee flip
  flourish fold forbid forecast frighten gaze glance glow gossip grin guard guess gulp hesitate hug
  illustrate impress impose inspire install interpret interrupt investigate judge justify kneel
  knit launch lecture limit linger lower maintain march marry master measure memorize mend merge
  mumble murmur negotiate nurture observe offend overcome overlook owe pause persuade phrase pledge
  ponder postpone pour praise predict preserve proceed promote pronounce propose punish pursue
  quarrel quit rearrange recall recover recycle reflect refine regret rehearse reject rejoice relax
  rely remind rename repair reply rescue resemble resist resolve restore retire reveal review
  rinse risk rotate rub scan scatter scold scribble scroll select separate shift shrug sigh simplify
  skim smooth snatch sneak soak solve soothe sparkle spill sprint squeeze stare stumble submit
  substitute suffer summarize supply surprise swallow tackle tease tidy tolerate trim translate
  transform tumble unite unpack utter vanish verify wander weave wipe wither wrestle yearn
  find try serve protect save seek shoot affect polish proofread rephrase reread rewrite delete retype outline paraphrase underline highlight
  brainstorm structure format publish approve cancel confuse demonstrate disappoint distinguish
  eliminate emerge fulfil generate hesitate impose inherit insert maintain narrate neglect overwhelm
  persist pronounce reassure resign spare strengthen tremble undo vary wake`)

/** Past tense and participle forms that cannot be derived from the base form. */
const IRREGULAR_VERBS = words(`am is are was were been being has had having does did doing went gone
  goes saw seen wrote written writes took taken gave given made came became knew known thought told
  said found got gotten left felt kept held brought bought built caught chose chosen drew drawn
  drove driven ate eaten fell fallen flew flown forgot forgotten grew grown hid hidden heard lost
  met paid ran sat sang sung spoke spoken stood taught threw thrown understood won woke woken wore
  worn began begun broke broken led lent meant sent slept spent swam swum rang rung sold shot shook
  sank sunk stole stolen struck stuck swore tore torn bit bitten blew blown dug fought forgave hung
  laid lit rode ridden sought shone slid spun sprang stung swept swung bent bled bred burnt dealt
  dreamt knelt leapt learnt shrank sprung strove thrust wove wept cannot gonna wanna gotta
  fed fled flung spat trod wrung shalt wilt could would might must ought`)

/** Words after which a bare infinitive follows ("to", modals, forms of "do"). */
export const BARE_INFINITIVE_TRIGGERS: ReadonlySet<string> = new Set(
  words(`can could will would shall should may might must do does did cannot let to
    don't doesn't didn't can't couldn't won't wouldn't shouldn't mustn't mightn't shan't`),
)

/** Forms of "be", used to spot passives and progressives. */
export const BE_FORMS: ReadonlySet<string> = new Set(words('be am is are was were been being'))

/** Forms of "have". */
export const HAVE_FORMS: ReadonlySet<string> = new Set(words('have has had having'))

/** Verbs after which an adjective, not an adverb, follows ("feels faster"). */
export const LINKING_FORMS: ReadonlySet<string> = new Set(
  words(`feel feels felt feeling seem seems seemed seeming look looks looked looking get gets got
    getting become becomes became becoming sound sounds sounded stay stays stayed remain remains
    remained grow grows grew growing taste tastes tasted smell smells smelled turn turns turned`),
)

/** Pronouns that can be the subject of a clause. */
export const SUBJECT_PRONOUNS: ReadonlySet<string> = new Set(words('i you he she it we they who'))

/** Possessive determiners, tagged as pronouns, that always open a noun phrase. */
export const POSSESSIVES: ReadonlySet<string> = new Set(words('my your his her its our their whose'))

/** Pronoun stems that form contractions such as "it's" and "they're". */
export const CONTRACTION_PRONOUNS: ReadonlySet<string> = new Set(
  words(`i you he she it we they that there here what who where when how why this these those
    everyone someone nobody somebody anybody everybody one`),
)

/** Nouns, singular or irregular plural forms. */
const NOUNS = words(`time year people way day man woman child children world life hand part place case week
  company system program government number night point home water room mother area money story fact
  month lot study book eye job word business issue side kind head house service friend father power
  hour game line end member law car city community name team minute idea kid body information back
  parent face level office door health person art war history party result morning reason research
  girl guy moment air teacher force education foot feet boy age policy music market sense nation plan
  college interest death experience effect class control care field development role effort rate heart
  drug leader light voice wife police mind price decision son view relationship town road arm
  difference value building action model season society tax director position player record paper
  space ground form event official matter center couple site project activity star table need court
  oil situation cost industry figure street image phone data picture practice piece land product doctor
  wall patient worker news test movie north love support technology step baby computer type attention
  film tree source organization hair window culture chance brother energy period course summer plant
  opportunity term letter condition choice writer reader editor author text sentence paragraph chapter
  draft thought note page title heading section outline plot character scene tone style rhythm focus
  sentences paragraphs words pages notes ideas readers writers editors authors stories chapters
  coffee tea bread apple dinner lunch breakfast garden river mountain ocean sea lake forest flower sun
  moon sky rain snow wind cloud weather fire stone grass dog cat bird fox horse fish animal
  patience courage freedom happiness silence peace beauty truth knowledge wisdom habit routine ritual
  dream memory feeling emotion mood desk chair table bed floor roof kitchen bedroom bathroom
  office school college library museum hospital station airport hotel restaurant cafe shop store bank
  church theater theatre park beach island village country state nation continent planet earth
  universe teacher student professor doctor nurse lawyer farmer artist painter singer actor
  engineer designer developer manager boss employee customer client visitor stranger neighbor
  neighbour guest king queen prince princess soldier captain pilot driver passenger
  mouse mice tooth teeth men women wives knives shelves thieves wolves
  paper pen pencil notebook laptop keyboard screen monitor mouse printer camera lamp candle clock
  watch bag box bottle cup glass plate bowl fork knife spoon basket bucket key lock ring
  morning afternoon evening noon midnight dawn dusk week weekend weekday monday tuesday wednesday
  thursday friday saturday sunday january february march april june july august september
  october november december spring autumn winter holiday birthday party wedding trip journey
  adventure story novel poem poetry essay article blog magazine newspaper journal diary letter
  email message sentence quote line verse chorus lyric song melody tune band concert show
  theme topic subject argument claim evidence example sample detail summary conclusion introduction
  beginning middle ending opening start finish goal aim target plan strategy method approach
  technique skill talent habit practice exercise lesson course class grade degree diploma
  problem solution answer question mystery puzzle secret surprise danger risk chance luck fortune
  success failure mistake error accident disaster victory defeat battle fight argument quarrel
  peace war freedom justice right duty rule law crime punishment prison police court judge jury
  money cash coin dollar euro cent price cost fee wage salary income profit loss debt budget bill
  tax gift prize reward award trophy medal hobby sport football soccer tennis golf race team
  member club group crowd audience family couple pair trio dozen bunch pile stack heap
  food meal snack soup salad sandwich pizza pasta rice meat chicken beef pork egg cheese butter milk
  sugar salt pepper honey fruit vegetable potato tomato onion carrot lemon orange banana grape
  wine beer juice cake cookie chocolate candy dessert
  shirt dress coat jacket hat shoe sock glove scarf pocket button zipper
  hammer nail screw wheel engine motor tool machine device gadget robot network internet website
  software hardware app file folder document image video audio sound signal wire cable battery
  idea inspiration imagination creativity curiosity attention concentration distraction interruption
  noise silence quiet calm storm thunder lightning breeze fog mist ice flame smoke dust dirt mud sand
  rock hill valley desert field meadow path trail bridge tunnel gate fence wall corner edge surface
  center middle top bottom side front rear inside outside distance direction
  sentence verb noun adjective adverb syllable letter alphabet grammar vocabulary language
  translation meaning definition sentence tense voice pronoun
  hunger thirst pain fever cough cold illness medicine cure treatment
  anger joy sorrow grief fear hope love hate pride shame guilt envy jealousy loneliness
  weakness strength weight height length width depth speed temperature pressure
  version draft revision edit comment feedback review critique
  ceiling lighthouse intern dollar copy cafe seed speed weed deed greed breed family anomaly assembly
  july monopoly butterfly jelly belly bully rally ally fly thing things size skin range series sister
  daughter husband finger task card ball color colour army agent amount base benefit blood century
  challenge coach debate decade discussion disease economy environment factor firm gas gun item leg
  media meeting mouth nature option owner partner politics president property purpose quality radio
  reality region resource response science scientist security shoulder speech staff stage standard
  statement stock television theory unit victim violence weapon yard adult growth management`)

/** Adjectives. */
const ADJECTIVES = words(`good bad new old young big small large long short high low tall wide narrow deep shallow
  thick thin heavy dark bright loud silent soft hard easy difficult simple complex vague dirty stale
  warm hot cold wet dry full empty open busy lazy happy sad angry afraid proud kind rude polite honest
  brave shy strong weak poor cheap expensive fast slow quick major minor common rare usual strange odd
  normal special particular different same similar equal various certain sure possible impossible
  likely unlikely real true false fair unfair important useful useless necessary helpful careful
  careless creative curious lonely beautiful ugly lovely nice great terrible awful wonderful amazing
  interesting boring funny serious silly smart clever wise foolish ready able available aware famous
  popular personal social political national local global foreign royal legal formal informal natural
  human modern ancient digital electric physical mental emotional medical financial economic cultural
  technical scientific historical favorite favourite favorite lazy tiny huge enormous giant massive
  mighty gentle rough smooth sharp blunt flat round square straight crooked curved tight loose
  sweet sour bitter salty spicy tasty delicious fresh rotten ripe raw boiled
  clever stupid dumb brilliant genius ordinary extraordinary unusual typical average regular
  random actual ideal perfect flawless broken lost missing hidden obvious clear
  hungry thirsty sleepy tired sick healthy ill hurt dead alive awake asleep sober drunk
  nervous anxious calm relaxed excited bored worried confused surprised shocked amazed pleased
  glad sorry grateful thankful jealous guilty ashamed embarrassed lonely lucky unlucky
  wealthy rich poor generous greedy selfish humble modest arrogant bold timid fearless
  eager keen willing reluctant ready prepared capable skilled talented gifted experienced
  early late recent current future past previous former latter initial primary secondary final
  next last first third fourth fifth sixth seventh eighth ninth tenth
  whole entire complete partial total full half
  single double triple multiple several numerous countless
  daily nightly weekly monthly yearly annual
  northern southern eastern western central
  rural urban suburban civil military domestic
  complete incomplete rough messy tidy neat organized
  main chief key basic central essential vital crucial critical significant meaningful
  strict flexible rigid stable steady constant continuous endless temporary permanent
  alone lonely together separate individual collective common shared
  visible invisible audible silent noisy quiet peaceful calm still
  safe dangerous risky secure reliable honest sincere genuine authentic fake artificial
  original unique distinct familiar unfamiliar unknown known strange foreign alien
  wooden golden silver plastic metal
  elegant graceful clumsy awkward comfortable uncomfortable cozy snug
  eloquent verbose concise brief succinct wordy fluent clumsy blunt
  heavy light weightless
  mere sheer utter pure mixed
  top bottom upper lower inner outer middle
  public private
  easy hard
  glorious horrible dreadful lousy mediocre decent adequate acceptable
  eager thorough careful brief vivid dull plain fancy cute charming
  overall total
  empty hollow solid liquid frozen
  loud quiet
  narrow
  fond fresh weird wild tame
  clean messy
  sensible reasonable rational logical absurd ridiculous
  lazy
  angry furious gentle
  blank
  vast
  tough
  rare
  slight
  extra
  past
  few
  own
  same
  real
  senior free sore friendly costly deadly elderly holy ugly silly likely unlikely lovely lonely`)

/** Adverbs that are listed outright because they are very common. */
const ADVERBS = words(`even not never always often sometimes usually rarely seldom already also too very quite
  really rather somewhat almost nearly barely hardly scarcely merely simply truly actually basically
  literally definitely probably perhaps maybe possibly certainly surely obviously clearly apparently
  evidently finally eventually suddenly quickly slowly soon later now then everywhere somewhere
  nowhere anywhere away forward together apart ahead aside abroad indoors outdoors upstairs
  downstairs again twice ever instead otherwise meanwhile however therefore thus hence moreover
  furthermore nevertheless nonetheless anyway anyhow indeed likewise accordingly overall especially
  particularly generally typically normally frequently occasionally constantly continually
  immediately instantly recently currently previously formerly lately afterwards afterward
  beforehand ago how why fairly highly deeply closely carefully gently softly loudly quietly calmly
  happily sadly easily mostly mainly partly fully totally completely entirely absolutely extremely
  incredibly surprisingly unfortunately fortunately honestly frankly seriously personally naturally
  essentially exactly directly slightly greatly somehow sometime nowadays forever anytime else
  elsewhere thereby hereby hereafter thereafter whenever mostly nearby overseas sideways
  backwards forwards downwards upwards onwards inwards outwards lengthwise
  almost altogether anew aloud alike amid awhile badly barely briefly bravely brightly
  cheaply clearly cleverly correctly daily dearly deliberately differently diligently
  eagerly effectively elsewhere enough equally everywhere extra faithfully fast
  firmly flatly foolishly freely gladly gracefully gradually hastily heavily hopefully
  hungrily inside intently jointly justly keenly kindly lazily lightly lovingly madly
  meanwhile mildly mysteriously narrowly neatly nervously noisily numerously
  openly painfully patiently perfectly playfully politely poorly powerfully precisely
  promptly properly proudly purely randomly rapidly readily reluctantly repeatedly
  roughly rudely safely secretly separately sharply shyly silently simply sincerely
  smoothly solemnly steadily strangely strictly strongly stubbornly successfully swiftly
  tenderly thoroughly tightly truthfully uneasily urgently usually vaguely violently
  warmly weakly wearily wildly wisely wrongly yearly`)

/** Interjections and greetings. */
const OTHERS = words(`please oh ah aha hey hi hello goodbye bye yes yeah yep nope wow oops hmm uh um alas hooray hurray
  ouch whoa cheers ugh phew yay huh eh ahem shh psst`)

/** Pronouns. */
const PRONOUNS = words(`i me my mine myself you your yours yourself yourselves he him his himself she her hers
  herself it its itself we us our ours ourselves they them their theirs themselves who whom
  someone somebody anyone anybody everyone everybody oneself whoever whomever whatever whichever
  none nobody nothing something anything everything`)

/** Determiners that have no other reading. */
const DETERMINERS = words('the a an every no whatever')

/** Prepositions that have no other reading. */
const PREPOSITIONS = words(`of in on at by with against among amid between despite during except from into onto
  per toward towards under unlike upon via versus within plus minus beside concerning regarding
  opposite near including to`)

/** Conjunctions that have no other reading. */
const CONJUNCTIONS = words(`and but or nor because although though unless whereas whether than if lest provided
  supposing`)

/** Numerals spelled out. */
const NUMBERS = words(`zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen
  fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety
  hundred thousand million billion trillion`)

function buildLexicon(): ReadonlyMap<string, readonly PosTag[]> {
  const lexicon = new Map<string, PosTag[]>()

  function add(word: string, tag: PosTag): void {
    const existing = lexicon.get(word)

    if (existing === undefined) {
      lexicon.set(word, [tag])
    } else if (!existing.includes(tag)) {
      existing.push(tag)
    }
  }

  for (const [tags, list] of AMBIGUOUS) {
    for (const word of list) {
      for (const tag of tags) {
        add(word, tag)
      }
    }
  }

  const SINGLES: readonly (readonly [PosTag, readonly string[]])[] = [
    ['pron', PRONOUNS],
    ['det', DETERMINERS],
    ['prep', PREPOSITIONS],
    ['conj', CONJUNCTIONS],
    ['num', NUMBERS],
    ['other', OTHERS],
    ['adv', ADVERBS],
    ['verb', IRREGULAR_VERBS],
    ['verb', VERBS],
    ['adj', ADJECTIVES],
    ['noun', NOUNS],
  ]

  for (const [tag, list] of SINGLES) {
    for (const word of list) {
      add(word, tag)
    }
  }

  return lexicon
}

/** Maps a lower-case word to its possible tags, most likely first. */
export const LEXICON: ReadonlyMap<string, readonly PosTag[]> = buildLexicon()
