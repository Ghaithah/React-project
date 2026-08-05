import Logo from './Logo';
import './Footer.css';

function Footer(props) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-dark text-white mt-4 app-footer">
      <div className="container d-flex justify-content-between align-items-center py-3 flex-wrap gap-2">
        <span className="mb-0 d-flex align-items-center gap-2">
          <Logo height={35} showWordmark={false} />
          <strong>Watch & Wonders</strong>
        </span>

        <span className="text-white small">
          &copy; {year} Watch & Wonder. All rights reserved.
        </span>
      </div>
    </footer>
  );
}

export default Footer;