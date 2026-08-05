function Footer(props) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-dark text-white mt-4">
      <div className="container d-flex justify-content-between align-items-center py-3 flex-wrap gap-2">
        <span className="mb-0">
          <i className="bi bi-people me-2"></i>
          Watch & Wonder    
        </span>

        <span className="text-white-50 small">
          &copy; {year} Watch & Wonder. All rights reserved.
        </span>
      </div>
    </footer>
  );
}

export default Footer;