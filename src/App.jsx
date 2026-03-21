import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./Components/Pages/Home";
import About1 from "./Components/Routes/About1";
import Courses1 from "./Components/Routes/Courses1";
import Team1 from "./Components/Routes/Team1";
import Contact1 from "./Components/Routes/Contact1";
import ErrorPage from "./Components/Pages/ErrorPage";
import SignUp from "./Components/Pages/Register";
import Javaprog from "./Components/Course/Javaprog";
import Dsa from "./Components/Course/Dsa";
import Mern from "./Components/Course/Mern";
import Fullstack from "./Components/Course/Fullstack";
import Programming from "./Components/Course/Programming";
import ShowBook from "./Components/Ebook/ShowBook";
import FloatingButtons from "./Components/FloatingButtons";
import Reactjs from "./Components/Course/Reactjs";
import Express from "./Components/Course/Express";
import Nodejs from "./Components/Course/Nodejs";
import Mongodb from "./Components/Course/Mongodb";
import Mysql from "./Components/Course/Mysql";
import Javascript from "./Components/Course/Javascript";
import Html from "./Components/Course/Html";
import Css from "./Components/Course/Css";
import Advjava from "./Components/Course/Advjava";
import JavaQuiz from "./Components/Quiz/JavaQuiz";
import Test from "./Components/Pages/Test";
import OnlineTest from "./Components/Pages/OnlineTest";
import MyRecordings from "./Components/Pages/MyRecordings";
import ErrorBoundary from "./Components/Pages/ErrorBoundary";
import FullstackQuiz from "./Components/Quiz/FullstackQuiz";
import JavascriptQuiz from "./Components/Quiz/JavascriptQuiz";
import ReactQuiz from "./Components/Quiz/ReactQuiz";
import Profile from "./Components/Pages/Profile";
import AdminDashboard from "./Components/Pages/AdminDashboard";
import TestCodeGate from "./Components/TestCodeGate";
import TestSignUp from "./Components/Pages/TestSignUp";

function App() {
  return (
    <>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About1 />} />
          <Route path="/courses" element={<Courses1 />} />
          <Route path="/team" element={<Team1 />} />
          <Route path="/contact" element={<Contact1 />} />
          <Route path="/error" element={<ErrorPage />} />
          <Route path="/register" element={<SignUp />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/test-signup" element={<TestSignUp />} />
          <Route path="/test-form" element={<TestSignUp />} />

          <Route path="/test" element={<TestCodeGate><Test /></TestCodeGate>} />
          <Route path="/test/online" element={<TestCodeGate><ErrorBoundary><OnlineTest /></ErrorBoundary></TestCodeGate>} />
          <Route path="/test/recordings" element={<TestCodeGate><MyRecordings /></TestCodeGate>} />
          <Route path="/test/java" element={<TestCodeGate><JavaQuiz /></TestCodeGate>} />
          <Route path="/test/fullstack" element={<TestCodeGate><FullstackQuiz /></TestCodeGate>} />
          <Route path="/test/javascript" element={<TestCodeGate><JavascriptQuiz /></TestCodeGate>} />
          <Route path="/test/react" element={<TestCodeGate><ReactQuiz /></TestCodeGate>} />

          <Route path="/courses/java" element={<Javaprog />} />
          <Route path="/courses/dsa" element={<Dsa />} />

          <Route path="/courses/mern" element={<Mern />} />
          <Route path="/courses/mern/nodejs" element={<Nodejs />} />
          <Route path="/courses/mern/express" element={<Express />} />
          <Route path="/courses/mern/react" element={<Reactjs />} />
          <Route path="/courses/mern/mongodb" element={<Mongodb />} />

          <Route path="/courses/fullstack" element={<Fullstack />} />
          <Route path="/courses/fullstack/sql" element={<Mysql />} />
          <Route path="/courses/fullstack/nodejs" element={<Nodejs />} />
          <Route path="/courses/fullstack/express" element={<Express />} />
          <Route path="/courses/fullstack/react" element={<Reactjs />} />
          <Route path="/courses/fullstack/mongodb" element={<Mongodb />} />
          <Route
            path="/courses/fullstack/javascript"
            element={<Javascript />}
          />
          <Route path="/courses/fullstack/html" element={<Html />} />
          <Route path="/courses/fullstack/css" element={<Css />} />

          <Route path="/cources/programming" element={<Programming />} />
          <Route path="/cources/programming/java" element={<Javaprog />} />
          <Route path="/cources/programming/advJava" element={<Advjava />} />
          <Route
            path="/cources/programming/javascript"
            element={<Javascript />}
          />

          <Route path="/library" element={<ShowBook />} />

          <Route path="*" element={<ErrorPage />} />
        </Routes>
        <FloatingButtons />
      </BrowserRouter>
    </>
  );
}

export default App;
