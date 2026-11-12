import { useCallback, useState } from '@lynx-js/react';

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

const SECTION = {
  hero: 1,
  product: 4,
  board: 5,
  brand: 6,
  start: 8,
};

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

function BoardLine({ row, wide }: { row: BoardRow; wide: boolean }) {
  const now = row.state === 'now';
  const shift = row.state === 'shift';
  const done = row.state === 'done';
  const rowClass = [
    'BoardRow',
    now ? 'BoardRowNow' : '',
    shift ? 'BoardRowShift' : '',
    done ? 'BoardRowDone' : '',
  ].join(' ');

  return (
    <view className={rowClass}>
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
    </view>
  );
}

export function App() {
  const [lang, setLang] = useState<Lang>('zh');
  const [joined, setJoined] = useState(false);
  const [toIndex, setToIndex] = useState(0);
  const wide = useIsWide(1000);
  const c = COPY[lang];

  const go = useCallback((index: number) => {
    setToIndex(index);
  }, []);

  const splashStandard = lang === 'zh' ? splashStandardZh : splashStandardEn;
  const splashFestive = lang === 'zh' ? splashFestiveZh : splashFestiveEn;
  const poster = lang === 'zh' ? posterStandardZh : posterStandardEn;

  return (
    <view
      className={lang === 'en' ? 'Site SiteEn' : 'Site'}
      bindlayoutchange={(event: any) => {
        const width = event?.detail?.width;
        if (typeof width === 'number') {
          reportViewportWidth(width);
        }
      }}
    >
      <view className="Boot">
        <BigMark />
        <text className="BootWord T">{lang === 'zh' ? '顺场' : 'Cue'}</text>
      </view>
      <scroll-view
        className="SiteScroll"
        scroll-orientation="vertical"
        scroll-to-index={toIndex}
      >
        {/* header */}
        <view className="Header">
          <view className={wide ? 'HeaderInner' : 'HeaderInner HeaderInnerNarrow'}>
            <view className="Lockup" bindtap={() => go(0)}>
              <Mark />
              <text className={lang === 'en' ? 'Wordmark WordmarkEn T' : 'Wordmark T'}>
                {lang === 'zh' ? '顺场' : 'Cue'}
              </text>
              <text className="WordmarkAlt T">{lang === 'zh' ? 'CUE' : '顺场'}</text>
            </view>

            {wide ? (
              <view className="Nav">
                <text className="NavItem T" bindtap={() => go(SECTION.product)}>
                  {c.nav.product}
                </text>
                <text className="NavItem T" bindtap={() => go(SECTION.board)}>
                  {c.nav.board}
                </text>
                <text className="NavItem T" bindtap={() => go(SECTION.brand)}>
                  {c.nav.brand}
                </text>
                <text className="NavItem NavItemStrong T" bindtap={() => go(SECTION.start)}>
                  {c.nav.start}
                </text>
              </view>
            ) : null}

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

        {/* hero */}
        <view className="Hero">
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
          <view className={wide ? 'HeroInner' : 'HeroInner HeroInnerNarrow'}>
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
              <text className={wide ? 'HeroLead Reveal Delay3 T' : 'HeroLead HeroLeadNarrow Reveal Delay3 T'}>
                {c.hero.lead}
              </text>
              <view className={wide ? 'Actions Reveal Delay4' : 'Actions ActionsNarrow Reveal Delay4'}>
                <view className="Btn BtnAmber" bindtap={() => go(SECTION.start)}>
                  <view className="BtnShine" />
                  <text className="BtnText BtnTextAmber T">{c.hero.primary}</text>
                  <text className="BtnArrow T">→</text>
                </view>
                <view className="Btn BtnGhost" bindtap={() => go(SECTION.board)}>
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
                </view>
                <text className="PhoneLabel T">{c.hero.festive}</text>
              </view>
            </view>
          </view>
        </view>

        {/* stats */}
        <view className="Stats">
          <view className={wide ? 'StatsInner' : 'StatsInner StatsInnerNarrow'}>
            {c.stats.map((stat, index) => (
              <view
                key={stat.label}
                className={
                  wide
                    ? index === 0
                      ? 'Stat StatFirst'
                      : 'Stat'
                    : 'Stat StatNarrow'
                }
              >
                <text className="StatValue T">{stat.value}</text>
                <text className="StatLabel T">{stat.label}</text>
              </view>
            ))}
          </view>
        </view>

        {/* problem */}
        <view className="Section">
          <view className={wide ? 'SectionInner' : 'SectionInner SectionInnerNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'SectionHead' : 'SectionHead SectionHeadNarrow'}>
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

            <view className={wide ? 'Cards' : 'Cards CardsNarrow'}>
              {c.problem.cards.map((card) => (
                <view key={card.no} className="Card">
                  <text className="CardNo T">{card.no}</text>
                  <text className="CardTitle T">{card.title}</text>
                  <text className="CardBody T">{card.body}</text>
                </view>
              ))}
            </view>

            <view className="Pull">
              <text className={wide ? 'PullText T' : 'PullText PullTextNarrow T'}>
                {c.problem.pull}
              </text>
            </view>
          </view>
        </view>

        {/* product */}
        <view className="Section">
          <view className={wide ? 'SectionInner' : 'SectionInner SectionInnerNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'SectionHead' : 'SectionHead SectionHeadNarrow'}>
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

            <view className={wide ? 'Features' : 'Features FeaturesNarrow'}>
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

        {/* live board */}
        <view className="Showcase">
          <view className="Beam BeamA" />
          <view className="Beam BeamB" />
          <view className="Beam BeamC" />
          <view className={wide ? 'ShowcaseInner' : 'ShowcaseInner ShowcaseInnerNarrow'}>
            <view className="ShowcaseCopy">
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
              <view className="Board">
                <view className="BoardHead">
                  <text className="BoardDay T">{c.board.day}</text>
                  <text className="BoardMeta T">{c.board.meta}</text>
                </view>
                <view className="BoardRows">
                  {c.board.rows.map((row) => (
                    <BoardLine key={row.time} row={row} wide={wide} />
                  ))}
                </view>
                <view className="BoardFoot">
                  <text className="BoardStat T">{c.board.stat}</text>
                  <view className="BoardProgress">
                    <view className="BoardTrack">
                      <view className="BoardFill" />
                    </view>
                    <text className="BoardStat T">{c.board.progress}</text>
                  </view>
                </view>
              </view>
              <text className="BoardNote T">{c.board.note}</text>
            </view>
          </view>
        </view>

        {/* brand mark */}
        <view className="Section">
          <view className={wide ? 'SectionInner' : 'SectionInner SectionInnerNarrow'}>
            <view className="SectionRule" />
            <view className={wide ? 'BrandInner' : 'BrandInner BrandInnerNarrow'}>
              <view className="BrandMarkCard">
                <view className="MarkHalo" />
                <view className="MarkHalo MarkHalo2" />
                <BigMark />
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

        {/* quote */}
        <view className="Quote">
          <view className="Fireworks">
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
          <view className="QuoteInner">
            {wide ? (
              <text className={lang === 'en' ? 'QuoteGlyph QuoteGlyphEn T' : 'QuoteGlyph T'}>
                {lang === 'zh' ? '顺' : 'Cue'}
              </text>
            ) : null}
            <text className="Eyebrow QuoteEyebrow T">{c.quote.eyebrow}</text>
            <text className={wide ? 'QuoteTitle T' : 'QuoteTitle QuoteTitleNarrow T'}>
              {c.quote.title}
            </text>
            <text className="QuoteBody T">{c.quote.body}</text>
          </view>
        </view>

        {/* start */}
        <view className="Section">
          <view className={wide ? 'SectionInner' : 'SectionInner SectionInnerNarrow'}>
            <view className="SectionRule" />
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
          </view>
        </view>

        {/* footer */}
        <view className="Footer">
          <view className="Marquee">
            <view className="MarqueeTrack">
              <text className="MarqueeText T">{c.footer.marquee.repeat(3)}</text>
              <text className="MarqueeText T">{c.footer.marquee.repeat(3)}</text>
            </view>
          </view>
          <view className={wide ? 'FooterInner' : 'FooterInner FooterInnerNarrow'}>
            <view className="FooterLeft">
              <text className="FooterBrand T">{lang === 'zh' ? '顺场 · CUE' : 'CUE · 顺场'}</text>
              <text className="FooterTag T">{c.footer.tagline}</text>
            </view>
            <text className="FooterCopy T">{c.footer.copyright}</text>
          </view>
        </view>
      </scroll-view>
    </view>
  );
}
