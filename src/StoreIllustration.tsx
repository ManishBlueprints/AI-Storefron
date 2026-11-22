import {
  BookOpen,
  Check,
  Heart,
  LockKeyhole,
  MessageCircle,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
export default function StoreIllustration() {
  return (
    <aside
      className="inspiration"
      aria-label="Your future storefront illustration"
    >
      <div className="orbit one" />
      <div className="orbit two" />
      <div className="floating-badge top">
        <span className="badge-icon mint">
          <Check size={16} />
        </span>
        Your expertise. Your business.
      </div>
      <div className="phone-card">
        <div className="phone-bar">
          <span />
          <span>yourname.superprofile</span>
          <LockKeyhole size={11} />
        </div>
        <div className="phone-cover">
          <span className="spark s1">✧</span>
          <span className="spark s2">✳</span>
          <span className="sun-shape" />
        </div>
        <div className="phone-avatar">
          <StoreIcon size={27} />
        </div>
        <div className="phone-body">
          <span className="tiny-label">YOUR EXPERTISE. YOUR STOREFRONT.</span>
          <h3>
            Big ideas.
            <br />
            Your own storefront.
          </h3>
          <p>
            A home for what you know.
            <br />
            Made for the people you inspire.
          </p>
          <div className="mini-product">
            <div className="mini-art peach">
              <BookOpen size={25} />
            </div>
            <div className="mini-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="mini-product">
            <div className="mini-art lilac">
              <MessageCircle size={25} />
            </div>
            <div className="mini-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="phone-cta">
            Explore my offers <Heart size={13} />
          </div>
        </div>
      </div>
      <div className="floating-badge bottom">
        <span className="badge-icon purple">
          <Sparkles size={17} />
        </span>
        <div>
          Built around <strong>you</strong>
          <small>Bio, products & prices, in one go</small>
        </div>
      </div>
      <div className="inspiration-caption">Create. Review. Publish.</div>
    </aside>
  );
}
