import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Import useAuth

function AboutIFSPage() {
    const navigate = useNavigate();
    const { isAuthenticated, loading } = useAuth(); // Use the hook
    // Placeholder removed

    // Optional: Add a loading state if needed, though basic display might be fine even while auth loads
    // if (loading) {
    //     return <div>Loading...</div>; 
    // }

    const handleLinkClick = (path) => {
        if (!isAuthenticated) {
            // Redirect to login, passing the intended destination
            navigate('/login', { state: { from: path } });
        } else {
            navigate(path);
        }
    };

    const renderConditionalLink = (path, text, pageName) => {
        if (isAuthenticated) {
            return <Link to={path}>{text}</Link>;
        } else {
            return (
                <button 
                    onClick={() => handleLinkClick(path)} 
                    className="btn btn-link p-0 m-0 align-baseline" 
                    title={`Login or Register to access the ${pageName}`}
                >
                    {text} (Login Required)
                </button>
            );
        }
    };

    return (
        <div className="container mt-4">
            <h1>About IFS & IFScenter: Your Companion for Internal Family Systems Exploration</h1>
            <hr />

            <p className="lead">
                Welcome! This page provides a foundational understanding of Internal Family Systems (IFS) therapy, its key concepts,
                and how IFScenter is designed to support your journey of self-discovery and healing. IFS was developed by
                <a href="https://ifs-institute.com/about-us/richard-c-schwartz-phd" target="_blank" rel="noopener noreferrer"> Dr. Richard C. Schwartz</a>.
            </p>

            <section id="what-is-ifs" className="my-5">
                <h2>Understanding Internal Family Systems (IFS) Therapy</h2>
                <p>
                    The core premise of IFS is that the mind is naturally multiple, composed of various subpersonalities or <strong>"parts"</strong>.
                    This multiplicity is normal, not a sign of pathology. The goal of IFS is not to eliminate parts, but to heal and harmonize them,
                    allowing your core <strong>Self</strong> to lead.
                </p>

                <h4>Key Concepts:</h4>
                <ul>
                    <li>
                        <strong>The Self:</strong> Your core consciousness, characterized by qualities like Calm, Curiosity, Compassion, Confidence,
                        Courage, Creativity, Connection, and Clarity (the 8 Cs). Everyone has a Self, though it can sometimes be obscured by parts.
                    </li>
                    <li>
                        <strong>Parts:</strong> Subpersonalities holding valuable qualities, intentions, and roles developed throughout life. They are not flaws.
                        <ul>
                            <li>
                                <strong>Exiles:</strong> Young, vulnerable parts carrying burdens of past pain, fear, or shame. Often protected (and hidden) by Managers and Firefighters.
                            </li>
                            <li>
                                <strong>Managers (Proactive Protectors):</strong> Parts that strive to manage daily life, prevent Exiles from being triggered, and maintain control through strategies like perfectionism, criticizing, people-pleasing, striving, etc.
                            </li>
                            <li>
                                <strong>Firefighters (Reactive Protectors):</strong> Parts that react impulsively when Exiles *are* triggered, trying to extinguish painful feelings quickly through methods like dissociation, substance use, rage, binge eating, etc.
                            </li>
                            <li>
                                <strong>Protectors:</strong> The collective term for Managers and Firefighters, highlighting their shared goal of protecting Exiles and the system.
                            </li>
                        </ul>
                    </li>
                    <li>
                        <strong>Burdens:</strong> Extreme beliefs or emotions (e.g., "I'm worthless," intense fear) carried by parts due to past experiences. These are not inherent to the part and can be released (unburdened).
                    </li>
                    <li>
                        <strong>Blending:</strong> When a part's feelings and perspective overwhelm your awareness, temporarily obscuring the Self. Shifting from "I am anxious" to "A part of me feels anxious" signifies unblending.
                    </li>
                    <li>
                        <strong>Trailheads:</strong> Starting points for inner exploration – a thought, feeling, sensation, image, or behavior that can lead you to connect with a part.
                    </li>
                </ul>
            </section>

            <section id="ifscenter-support" className="my-5">
                <h2>How IFScenter Supports Your IFS Journey</h2>
                <p>
                    IFScenter provides tools designed to help you apply these concepts directly:
                </p>
                <ol>
                    <li>
                        <strong>Mapping Your Inner World ({renderConditionalLink('/parts', 'Parts Page', 'Parts Page')}):</strong>
                        <p>Create entries for your identified parts. Filling in details like feelings, beliefs, roles, and relationships helps you understand them better and provides essential context for the System Map and Guided Sessions. The more detail you provide, the richer your experience will be.</p>
                    </li>
                    <li>
                        <strong>Visualizing Your System ({renderConditionalLink('/system-map', 'System Map Page', 'System Map Page')}):</strong>
                        <p>Parts you create automatically appear as nodes on the System Map. This unique visualization helps you see your internal landscape, understand relationships between parts, identify clusters, and grasp the dynamics of your inner system more clearly.</p>
                    </li>
                    <li>
                        <strong>Guided Self-Exploration ({renderConditionalLink('/sessions', 'Guided Sessions', 'Guided Sessions')}):</strong>
                        <p>Engage in interactive, AI-powered sessions. The information you've entered about your parts informs the AI guide (LLM), allowing you to ask specific questions like, "How can I connect with this anxious part?" or "What might my inner critic need?" The richer your part profiles, the more personalized and insightful the guidance.</p>
                    </li>
                    <li>
                        <strong>Reflection and Integration ({renderConditionalLink('/journal', 'Journal Page', 'Journal Page')}):</strong>
                        <p>Use the journal to reflect on sessions, track insights about parts, document the unburdening process, or simply process daily experiences through an IFS lens.</p>
                    </li>
                </ol>
            </section>

            <section id="getting-most" className="my-5">
                <h2>Getting the Most Out of IFScenter</h2>
                <p>
                    We suggest starting by identifying and creating entries for a few parts. Explore them on the map, perhaps try a guided session focused on one part, and then use the journal to capture your reflections. Remember, this is a journey of self-discovery – approach it with patience and curiosity.
                </p>
            </section>

            <section id="further-reading" className="my-5">
                <h2>Further Reading & Resources</h2>
                <p>For those interested in learning more about Internal Family Systems, we recommend these resources:</p>
                <ul>
                    <li><strong>Official IFS Institute Website:</strong> <a href="https://ifs-institute.com/" target="_blank" rel="noopener noreferrer">ifs-institute.com</a></li>
                    <li>
                        <strong>Books:</strong>
                        <ul>
                            <li><em>Introduction to the Internal Family Systems Model</em> by Richard C. Schwartz, PhD</li>
                            <li><em>No Bad Parts: Healing Trauma and Restoring Wholeness with the Internal Family Systems Model</em> by Richard C. Schwartz, PhD</li>
                            <li><em>Self-Therapy: A Step-By-Step Guide to Creating Wholeness and Healing Your Inner Child Using IFS</em> by Jay Earley, PhD</li>
                            <li><em>Good Inside: A Guide to Becoming the Parent You Want to Be</em> by Dr. Becky Kennedy (Applies IFS principles to parenting)</li>
                        </ul>
                    </li>
                </ul>
                <p><small>Note: Book links are typically available through major online retailers or local bookstores.</small></p>
            </section>

        </div>
    );
}

export default AboutIFSPage; 