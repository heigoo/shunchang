import { useCallback, useRef, useState } from '@lynx-js/react';

import { reportViewportWidth, useIsWide } from '../src/platform/viewport';
import { COPY } from './copy';
import type { BoardRow, Lang } from './copy';
import posterStandardEn from './assets/poster-standard-en.png';
import posterStandardZh from './assets/poster-standard-zh.png';
import splashFestiveEn from './assets/splash-festive-en.png';
import splashFestiveZh from './assets/splash-festive-zh.png';
import splashStandardEn from './assets/splash-standard-en.png';
import splashStandardZh from './assets/splash-standard-zh.png';
import './site.css';

const SLIDE_COUNT = 7;

const CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37 + 9) % 100,
  color: ['C1', 'C2', 'C3', 'C4'][i % 4],
  speed: ['CSlow', 'CMid', 'CFast'][i % 3],
  size: ['CBig', 'CSmall', '', 'CBig', '', 'CSmall'][i % 6],
  delay: `CD${i % 7}`,
}));

const CELEBRATE = Array.from({ length: 24 }, (_, i) => ({
  left: (i * 43 + 7) % 100,
  color: ['C1', 'C2', 'C3', 'C4'][i % 4],
  size: ['CBig', 'CSmall', '', 'CBig', '', 'CSmall'][i % 6],
  delay: `CD${i % 5}`,
}));

const BURSTS = [
  { x: 68, y: 26, delay: 'FD0' },
  { x: 84, y: 56, delay: 'FD1' },
  { x: 72, y: 78, delay: 'FD2' },
];

const DIRECTIONS = ['FwN', 'FwNE', 'FwE', 'FwSE', 'FwS', 'FwSW', 'FwW', 'FwNW'];

function Mark() {
  return (
    <view className="Mark">
      <view className="MarkBar MarkUp" />
      <view className="MarkBar MarkUpEdge" />
      <view className="MarkBar MarkLow" />
      <view className="MarkBar MarkLowEdge" />
    </view>
  );
}

function BigMark() {
  return (
    <view className="BigMark">
      <view className="MarkBar BigMarkUp" />
      <view className="MarkBar BigMarkUpEdge" />
      <view className="MarkBar BigMarkLow" />
      <view className="MarkBar BigMarkLowEdge" />
    </view>
  );
}

function BoardLine({
  row,
  wide,
  checked,
  onTap,
}: {
  row: BoardRow;
  wide: boolean;
  checked: boolean;
  onTap: () => void;
}) {
  const now = row.state === 'now';
  const shift = row.state === 'shift';
  const done = row.state === 'done' || checked;
  const rowClass = [
    'BoardRow',
    'BoardRowTap',
    now ? 'BoardRowNow' : '',
    shift ? 'BoardRowShift' : '',
    done ? 'BoardRowDone' : '',
    checked ? 'BoardRowChecked' : '',
  ].join(' ');

  return (
    <view className={rowClass} bindtap={onTap}>
      <view className="BoardTimeCol">
        <view className={now ? 'BoardDot BoardDotNow' : 'BoardDot'} />
        <text className="BoardTime T">{row.time}</text>
        {row.orig ? <text className="BoardOrig T">{row.orig}</text> : null}
      </view>
      <view className="BoardMain">
        <text className="BoardTitle T">{row.title}</text>
        {wide ? <text className="BoardOwner T">{row.owner}</text> : null}
      </view>
      <text className="BoardTag T">{row.tag}</text>
      <view className={checked ? 'BoardTick BoardTickOn' : 'BoardTick'}>
        <text className="BoardTickText T">✓</text>
      </view>
    </view>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [joined, setJoined] = useState(false);
  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState<'next' | 'prev'>('next');
  const [doneRows, setDoneRows] = useState<Record<number, boolean>>({});
  const [fwKey, setFwKey] = useState(0);
  const [markTap, setMarkTap] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const wide = useIsWide(1000);
  const navWide = useIsWide(1120);
  const railWide = useIsWide(1340);
  const tiny = !useIsWide(360);
  const c = COPY[lang];

  const goSlide = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(SLIDE_COUNT - 1, target));
      setMenuOpen(false);
      if (next === slide) return;
      setDir(next > slide ? 'next' : 'prev');
      setSlide(next);
    },
    [slide],
  );

  const nextSlide = useCallback(() => goSlide(slide + 1), [goSlide, slide]);
  const prevSlide = useCallback(() => goSlide(slide - 1), [goSlide, slide]);

  const onTouchStart = useCallback((event: any) => {
    const t = event?.touches?.[0] ?? event?.detail?.touches?.[0];
    if (!t) return;
    touchStart.current = {
      x: t.clientX ?? t.pageX ?? 0,
      y: t.clientY ?? t.pageY ?? 0,
    };
  }, []);

  const onTouchEnd = useCallback(
    (event: any) => {
      const t =
        event?.changedTouches?.[0] ??
        event?.touches?.[0] ??
        event?.detail?.changedTouches?.[0];
      if (!t) return;
      const dx = (t.clientX ?? t.pageX ?? 0) - touchStart.current.x;
      const dy = (t.clientY ?? t.pageY ?? 0) - touchStart.current.y;
      if (Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(dx)) {
        if (dy < 0) goSlide(slide + 1);
        else goSlide(slide - 1);
      }
    },
    [goSlide, slide],
  );

  const toggleRow = useCallback((index: number) => {
    setDoneRows((prev) => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const boardRows = c.board.rows;
  const boardTargets = boardRows.filter((row) => row.state !== 'done').length;
  const checkedCount = boardRows.reduce(
    (count, _row, index) => count + (doneRows[index] ? 1 : 0),
    0,
  );
  const boardAllDone = boardTargets > 0 && checkedCount >= boardTargets;
  const boardPct = boardAllDone
    ? 100
    : Math.round(38 + (checkedCount / Math.max(1, boardTargets)) * 62);

  const splashStandard = lang === 'zh' ? splashStandardZh : splashStandardEn;
  const splashFestive = lang === 'zh' ? splashFestiveZh : splashFestiveEn;
  const poster = lang === 'zh' ? posterStandardZh : posterStandardEn;

  const renderSlide = () => {
    if (slide === 0) {
      return (
        <view className="Slide SlideCover">
          <view className="Orb OrbA" />
          <view className="Orb OrbB" />
          <view className="HeroScan" />
          <view className="ConfettiLayer">
            {CONFETTI.map((piece, index) => (
              <view
                key={index}
                className={`Confetti ${piece.color} ${piece.speed} ${piece.size} ${piece.delay}`}
                style={{ left: `${piece.left}%` }}
              />
            ))}
          </view>

          <view className={wide ? 'CoverInner' : 'CoverInner CoverInnerNarrow'}>
            <view className="HeroCopy">
              <text className="Eyebrow HeroEyebrow T">{c.hero.eyebrow}</text>
              <view className="HeroTitleWrap">
                {c.hero.title.map((line, index) => (
                  <text
                    key={line}
                    className={
                      wide
                        ? 'HeroTitle HeroLine T'
                        : 'HeroTitle HeroTitleNarrow HeroLine T'
                    }
                    style={{ animationDelay: `${index * 110}ms` }}
                  >
                    {line}
                  </text>
                ))}
              </view>
              <text
                className={
                  wide
                    ? 'HeroLead Reveal Delay3 T'
                    : 'HeroLead HeroLeadNarrow Reveal Delay3 T'
                }
              >
                {c.hero.lead}
              </text>
              <view className={wide ? 'Actions Reveal Delay4' : 'Actions ActionsNarrow Reveal Delay4'}>
                <view className="Btn BtnAmber" bindtap={() => goSlide(6)}>
                  <view className="BtnShine" />
                  <text className="BtnText BtnTextAmber T">{c.hero.primary}</text>
                  <text className="BtnArrow T">→</text>
                </view>
                <view className="Btn BtnGhost" bindtap={() => goSlide(3)}>
                  <text className="BtnText T">{c.hero.secondary}</text>
                </view>
              </view>
            </view>

            <view className={wide ? 'Phones' : 'Phones PhonesNarrow'}>
              <view className="PhoneCol Reveal Delay5">
                <view className={wide ? 'Phone' : 'Phone PhoneNarrow'}>
                  <image
                    className={wide ? 'PhoneImg' : 'PhoneImg PhoneImgNarrow'}
                    src={splashStandard}
                    mode="aspectFill"
                  />
                  <view className="PhoneSheen" />
                </view>
                <text className="PhoneLabel T">{c.hero.standard}</text>
              </view>
              <view className="PhoneCol PhoneColOffset Reveal Delay6">
                <view className={wide ? 'Phone' : 'Phone PhoneNarrow'}>
                  <image
                    className={wide ? 'PhoneImg' : 'PhoneImg PhoneImgNarrow'}
                    src={splashFestive}
                    mode="aspectFill"
                  />
                  <view className="PhoneSheen PhoneSheenLate" />
                </view>
                <text className="PhoneLabel T">{c.hero.festive}</text>
              </view>
            </view>

            <view className="TinyStamp">
              <text className="TinyStampText">顺场</text>
              <text className="TinyStampSub">现场调度</text>
            </view>
          </view>

          <view className={wide ? 'CoverStats' : 'CoverStats CoverStatsNarrow'}>
            {c.stats.map((stat) => (
              <view key={stat.label} className="CoverStat">
                <text className="CoverStatValue T">{stat.value}</text>
                <text className="CoverStatLabel T">{stat.label}</text>
              </view>
            ))}
          </view>
        </view>
      );
    }

    if (slide === 1) {
      return (
        <view className="Slide SlidePaper">
          <view className={wide ? 'SlideInnerDeck' : 'SlideInnerDeck SlideInnerDeckNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'SectionHead DeckHead' : 'SectionHead SectionHeadNarrow DeckHead'}>
              <view className="HeadLeft">
                <text className="Eyebrow T">{c.problem.eyebrow}</text>
                <text className={wide ? 'SectionTitle T' : 'SectionTitle SectionTitleNarrow T'}>
                  {c.problem.title}
                </text>
              </view>
              <text className={wide ? 'SectionLead T' : 'SectionLead SectionLeadNarrow T'}>
                {c.problem.lead}
              </text>
            </view>

            <view className={wide ? 'Cards Reveal Delay2' : 'Cards CardsNarrow Reveal Delay2'}>
              {c.problem.cards.map((card) => (
                <view key={card.no} className="Card">
                  <text className="CardNo T">{card.no}</text>
                  <text className="CardTitle T">{card.title}</text>
                  <text className="CardBody T">{card.body}</text>
                </view>
              ))}
            </view>

            <view className="Pull Reveal Delay3">
              <text className={wide ? 'PullText T' : 'PullText PullTextNarrow T'}>
                {c.problem.pull}
              </text>
            </view>
          </view>
        </view>
      );
    }

    if (slide === 2) {
      return (
        <view className="Slide SlidePaper">
          <view className={wide ? 'SlideInnerDeck' : 'SlideInnerDeck SlideInnerDeckNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'SectionHead DeckHead' : 'SectionHead SectionHeadNarrow DeckHead'}>
              <view className="HeadLeft">
                <text className="Eyebrow T">{c.product.eyebrow}</text>
                <text className={wide ? 'SectionTitle T' : 'SectionTitle SectionTitleNarrow T'}>
                  {c.product.title}
                </text>
              </view>
              <text className={wide ? 'SectionLead T' : 'SectionLead SectionLeadNarrow T'}>
                {c.product.lead}
              </text>
            </view>

            <view className={wide ? 'Features Reveal Delay2' : 'Features FeaturesNarrow Reveal Delay2'}>
              {c.product.features.map((feature) => (
                <view key={feature.no} className="Feature">
                  <text className="FeatureNo T">{feature.no}</text>
                  <text className="FeatureTitle T">{feature.title}</text>
                  <text className="FeatureBody T">{feature.body}</text>
                </view>
              ))}
            </view>
          </view>
        </view>
      );
    }

    if (slide === 3) {
      return (
        <view className="Slide SlideDark">
          <view className="Beam BeamA" />
          <view className="Beam BeamB" />
          <view className="Beam BeamC" />
          <view
            className={
              wide
                ? 'SlideInnerDeck DeckBoardInner'
                : 'SlideInnerDeck SlideInnerDeckNarrow DeckBoardInner DeckBoardInnerNarrow'
            }
          >
            <view className={wide ? 'ShowcaseCopy' : 'ShowcaseCopy ShowcaseCopyNarrow'}>
              <text className="Eyebrow DarkEyebrow T">{c.board.eyebrow}</text>
              <view className="DarkTitleWrap">
                {c.board.title.map((line) => (
                  <text
                    key={line}
                    className={wide ? 'DarkTitle T' : 'DarkTitle DarkTitleNarrow T'}
                  >
                    {line}
                  </text>
                ))}
              </view>
              <text className="DarkBody T">{c.board.body}</text>
            </view>

            <view className="BoardCol">
              {boardAllDone ? (
                <view className="BoardCelebrate">
                  {CELEBRATE.slice(0, 14).map((piece, index) => (
                    <view
                      key={index}
                      className={`CelebratePiece BoardPiece ${piece.color} ${piece.size} ${piece.delay}`}
                      style={{ left: `${piece.left}%` }}
                    />
                  ))}
                </view>
              ) : null}
              <view className={boardAllDone ? 'Board BoardLanded' : 'Board'}>
                <view className="BoardHead">
                  <text className="BoardDay T">{c.board.day}</text>
                  <text className="BoardMeta T">{c.board.meta}</text>
                </view>
                <view className="BoardRows">
                  {boardRows.map((row, index) => (
                    <BoardLine
                      key={row.time}
                      row={row}
                      wide={wide}
                      checked={!!doneRows[index]}
                      onTap={() => toggleRow(index)}
                    />
                  ))}
                </view>
                <view className="BoardFoot">
                  <text className="BoardStat T">{c.board.stat}</text>
                  <view className="BoardProgress">
                    <view className="BoardTrack">
                      <view className="BoardFill" style={{ width: `${boardPct}%` }} />
                    </view>
                    <text className="BoardStat T">{c.board.progress}</text>
                  </view>
                </view>
              </view>
              <view className="BoardNoteRow">
                <text className="BoardNote T">{c.board.note}</text>
                <text className={boardAllDone ? 'BoardHint BoardHintOn T' : 'BoardHint T'}>
                  {boardAllDone ? c.board.allDone : c.board.tryHint}
                </text>
              </view>
            </view>
          </view>
        </view>
      );
    }

    if (slide === 4) {
      return (
        <view className="Slide SlidePaper">
          <view className={wide ? 'SlideInnerDeck' : 'SlideInnerDeck SlideInnerDeckNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'BrandInner' : 'BrandInner BrandInnerNarrow'}>
              <view className="BrandMarkCard" bindtap={() => setMarkTap((n) => n + 1)}>
                <view className="MarkHalo" />
                <view className="MarkHalo MarkHalo2" />
                <view key={markTap} className={markTap > 0 ? 'MarkPop MarkPopOn' : 'MarkPop'}>
                  <BigMark />
                </view>
              </view>
              <view className="BrandCopy">
                <text className="Eyebrow T">{c.brand.eyebrow}</text>
                <text className={wide ? 'SectionTitle T' : 'SectionTitle SectionTitleNarrow T'}>
                  {c.brand.title}
                </text>
                {c.brand.paras.map((para, index) => (
                  <text
                    key={para}
                    className={index === 2 ? 'BrandPara BrandParaStrong T' : 'BrandPara T'}
                  >
                    {para}
                  </text>
                ))}
                <text className="BrandSpec T">{c.brand.spec}</text>
              </view>
            </view>
          </view>
        </view>
      );
    }

    if (slide === 5) {
      return (
        <view className="Slide SlideQuote" bindtap={() => setFwKey((n) => n + 1)}>
          <view className="Fireworks" key={fwKey}>
            {BURSTS.map((burst, index) => (
              <view
                key={index}
                className="FwBurst"
                style={{ left: `${burst.x}%`, top: `${burst.y}%` }}
              >
                <view className={`FwGlow ${burst.delay}`} />
                <view className={`FwRing ${burst.delay}`} />
                <view className={`FwCore ${burst.delay}`} />
                {DIRECTIONS.map((direction, dirIndex) => (
                  <view
                    key={direction}
                    className={`Fw ${direction} ${burst.delay} ${
                      dirIndex % 2 === 0 ? 'FwGold' : 'FwCream'
                    }`}
                  />
                ))}
              </view>
            ))}
          </view>
          {fwKey > 0 ? (
            <view className="QuoteWave" key={`wave-${fwKey}`}>
              <view className="QuoteWaveRing" />
              <view className="QuoteWaveRing QuoteWaveRing2" />
            </view>
          ) : null}
          <view className={wide ? 'QuoteInner' : 'QuoteInner QuoteInnerDeckNarrow'}>
            {wide ? (
              <text className={lang === 'en' ? 'QuoteGlyph QuoteGlyphEn T' : 'QuoteGlyph T'}>
                顺
              </text>
            ) : null}
            <text className="Eyebrow QuoteEyebrow T">{c.quote.eyebrow}</text>
            <text className={wide ? 'QuoteTitle T' : 'QuoteTitle QuoteTitleNarrow T'}>
              {c.quote.title}
            </text>
            <text className="QuoteBody T">{c.quote.body}</text>
            <text className={wide ? 'QuoteHint T' : 'QuoteHint QuoteHintNarrow T'}>
              {c.quote.hint}
            </text>
          </view>
        </view>
      );
    }

    return (
      <view className="Slide SlidePaper SlideStart">
        <view
          className={
            wide
              ? 'SlideInnerDeck SlideInnerDeckGrow DeckStartInner'
              : 'SlideInnerDeck SlideInnerDeckGrow SlideInnerDeckNarrow DeckStartInner DeckStartInnerNarrow'
          }
        >
          <view className={wide ? 'CtaInner' : 'CtaInner CtaInnerNarrow'}>
            {joined ? (
              <view className="Celebrate">
                {CELEBRATE.map((piece, index) => (
                  <view
                    key={index}
                    className={`CelebratePiece ${piece.color} ${piece.size} ${piece.delay}`}
                    style={{ left: `${piece.left}%` }}
                  />
                ))}
              </view>
            ) : null}
            <view className="CtaCopy">
              <text className="Eyebrow T">{c.cta.eyebrow}</text>
              <text className={wide ? 'SectionTitle T' : 'SectionTitle SectionTitleNarrow T'}>
                {c.cta.title}
              </text>
              <text className="CtaBody T">{c.cta.body}</text>
              <view className={wide ? 'CtaActions' : 'CtaActions CtaActionsNarrow'}>
                <view className="Btn BtnAmber" bindtap={() => setJoined(true)}>
                  <view className="BtnShine" />
                  <text className="BtnText BtnTextAmber T">{c.cta.button}</text>
                  <text className="BtnArrow T">→</text>
                </view>
                <text className="CtaNote T">{c.cta.note}</text>
              </view>
              {joined ? (
                <view className="Toast" bindtap={() => setJoined(false)}>
                  <text className="ToastText T">{c.cta.done}</text>
                </view>
              ) : null}
            </view>

            <view className={wide ? 'PosterWrap' : 'PosterWrap PosterWrapNarrow'}>
              <view className={wide ? 'Poster' : 'Poster PosterNarrow'}>
                <image
                  className={wide ? 'PosterImg' : 'PosterImg PosterImgNarrow'}
                  src={poster}
                  mode="aspectFill"
                />
              </view>
              <text className="PosterCaption T">{c.cta.posterCaption}</text>
            </view>
          </view>

          <view className="SlideFootRow">
            <text className="SlideFootBrand T">{c.footer.tagline}</text>
            <text className="SlideFootCopy T">{c.footer.copyright}</text>
          </view>
        </view>

        <view className="Marquee SlideMarquee">
          <view className="MarqueeTrack">
            <text className="MarqueeText T">{c.footer.marquee.repeat(3)}</text>
            <text className="MarqueeText T">{c.footer.marquee.repeat(3)}</text>
          </view>
        </view>
      </view>
    );
  };

  return (
    <view
      className={[
        'Site',
        lang === 'en' ? 'SiteEn' : '',
        tiny ? 'SiteTiny' : '',
      ].join(' ')}
      bindlayoutchange={(event: any) => {
        const width = event?.detail?.width;
        if (typeof width === 'number') {
          reportViewportWidth(width);
        }
      }}
    >
      <view className="Boot">
        <BigMark />
        <text className="BootWord T">{lang === 'zh' ? '顺场' : 'Shunchang'}</text>
      </view>

      <view className="Deck">
        <view className={navWide ? 'DeckBar' : 'DeckBar DeckBarNarrow'}>
          <view className="Lockup" bindtap={() => goSlide(0)}>
            <Mark />
            <text className={lang === 'en' ? 'Wordmark WordmarkEn T' : 'Wordmark T'}>
              {lang === 'zh' ? '顺场' : 'Shunchang'}
            </text>
            <text className="WordmarkAlt T">{lang === 'zh' ? 'SHUNCHANG' : '顺场'}</text>
          </view>

          {navWide ? (
            <view className="DeckTopNav">
              {c.deck.chapters.map((label, index) => (
                <view
                  key={label}
                  className={index === slide ? 'DeckNavItem DeckNavItemOn' : 'DeckNavItem'}
                  bindtap={() => goSlide(index)}
                >
                  <text className="DeckNavNo T">{`0${index + 1}`}</text>
                  <text className="DeckNavLabel T">{label}</text>
                </view>
              ))}
            </view>
          ) : (
            <view className="DeckMenuBtn" bindtap={() => setMenuOpen(true)}>
              <text className="DeckMenuBtnText T">{c.deck.menu}</text>
              <view className="DeckMenuBtnBars">
                <view className="DeckMenuBtnBar" />
                <view className="DeckMenuBtnBar" />
              </view>
            </view>
          )}

          <view className="DeckBarRight">
            <view
              className="DeckCta"
              bindtap={() =>
                slide === SLIDE_COUNT - 1 ? setJoined(true) : goSlide(SLIDE_COUNT - 1)
              }
            >
              <text className="DeckCtaText T">
                {navWide ? c.cta.button : lang === 'zh' ? '开始' : 'Start'}
              </text>
              <text className="DeckCtaArrow T">→</text>
            </view>
            <view className="Lang">
              <view
                className={lang === 'zh' ? 'LangBtn LangBtnOn' : 'LangBtn'}
                bindtap={() => setLang('zh')}
              >
                <text className={lang === 'zh' ? 'LangText LangTextOn T' : 'LangText T'}>
                  中文
                </text>
              </view>
              <view
                className={lang === 'en' ? 'LangBtn LangBtnOn' : 'LangBtn'}
                bindtap={() => setLang('en')}
              >
                <text className={lang === 'en' ? 'LangText LangTextOn T' : 'LangText T'}>
                  EN
                </text>
              </view>
            </view>
          </view>
        </view>

        <view
          className="DeckStage"
          bindtouchstart={onTouchStart}
          bindtouchend={onTouchEnd}
        >
          <view className="DeckProgress">
            <view
              className="DeckProgressFill"
              style={{ width: `${((slide + 1) / SLIDE_COUNT) * 100}%` }}
            />
          </view>
          <view
            key={slide}
            className={`SlideAnim ${dir === 'next' ? 'SlideInNext' : 'SlideInPrev'}`}
          >
            {renderSlide()}
          </view>
          <text key={`ghost-${slide}`} className={wide ? 'SlideGhost T' : 'SlideGhost SlideGhostNarrow T'}>
            {`0${slide + 1}`}
          </text>
        </view>

        {railWide ? (
          <view className="DeckRail">
            {c.deck.chapters.map((label, index) => (
              <view
                key={label}
                className={index === slide ? 'RailItem RailItemOn' : 'RailItem'}
                bindtap={() => goSlide(index)}
              >
                <text className="RailLabel T">{label}</text>
                <view className="RailLine" />
              </view>
            ))}
          </view>
        ) : null}

        <view className={wide ? 'DeckFoot' : 'DeckFoot DeckFootNarrow'}>
          <text className="DeckCounter T">{`0${slide + 1} / 0${SLIDE_COUNT}`}</text>

          <view className="DeckDots">
            {Array.from({ length: SLIDE_COUNT }, (_, index) => (
              <view
                key={index}
                className={index === slide ? 'DeckDot DeckDotOn' : 'DeckDot'}
                bindtap={() => goSlide(index)}
              >
                <view className="DeckDotInner" />
              </view>
            ))}
          </view>

          <view className="DeckNav">
            {wide ? <text className="DeckHint T">{c.deck.hint}</text> : null}
            <view
              className={slide === 0 ? 'DeckBtn DeckBtnOff' : 'DeckBtn'}
              bindtap={prevSlide}
            >
              <text className="DeckBtnText T">←</text>
            </view>
            <view
              className={slide === SLIDE_COUNT - 1 ? 'DeckBtn DeckBtnOff' : 'DeckBtn DeckBtnOn'}
              bindtap={nextSlide}
            >
              <text
                className={
                  slide === SLIDE_COUNT - 1 ? 'DeckBtnText T' : 'DeckBtnText DeckBtnTextOn T'
                }
              >
                →
              </text>
            </view>
          </view>
        </view>

        {menuOpen ? (
          <view className="DeckMenu">
            <view className="DeckMenuHead">
              <text className="DeckMenuTitle T">{c.deck.menu}</text>
              <view className="DeckMenuClose" bindtap={() => setMenuOpen(false)}>
                <text className="DeckMenuCloseText T">×</text>
              </view>
            </view>
            <view className="DeckMenuList">
              {c.deck.chapters.map((label, index) => (
                <view
                  key={label}
                  className={index === slide ? 'DeckMenuItem DeckMenuItemOn' : 'DeckMenuItem'}
                  bindtap={() => goSlide(index)}
                >
                  <text className="DeckMenuNo T">{`0${index + 1}`}</text>
                  <text className="DeckMenuLabel T">{label}</text>
                  {index === slide ? <text className="DeckMenuNow T">●</text> : null}
                </view>
              ))}
            </view>
            <view className="DeckMenuSkip" bindtap={() => goSlide(SLIDE_COUNT - 1)}>
              <text className="DeckMenuSkipText T">{c.deck.skip}</text>
              <text className="DeckMenuSkipArrow T">→</text>
            </view>
            <text className="DeckMenuHint T">{c.deck.menuHint}</text>
          </view>
        ) : null}
      </view>
    </view>
  );
}
