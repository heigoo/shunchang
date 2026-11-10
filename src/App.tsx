import './ui/tokens.css';
import './App.css';

export function App() {
  return (
    <view className="Screen theme-light">
      <view className="Header">
        <text className="Brand">顺场</text>
        <text className="SheetCode">SHEET 00 / 00</text>
      </view>

      <view className="Rule" />

      <view className="Body">
        <text className="SectionTitle">现场手册</text>

        <view className="Empty">
          <text className="EmptyTitle">还没有手册</text>
          <text className="EmptyHint">从模板开始，或建一份空白手册。</text>
        </view>
      </view>

      <view className="Footer">
        <view className="PrimaryButton">
          <text className="PrimaryButtonLabel">新建手册</text>
        </view>
      </view>
    </view>
  );
}
