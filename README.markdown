**Jesyll** is a JavaScript version of
[Jekyll](http://wiki.github.com/mojombo/jekyll).

You give it a source tree of static files, and it transforms it to another
directory tree, which is generally a static website.

It's built on top of [JSON Template](http://code.google.com/p/json-template).

Source File Scanner
-------------------

Any file with a path **not** beginning with _ or __ is **copied verbatim** to
the destination.

Anything beginning with _ is treated as potential source content, and is
**transformed** instead of copied verbatim to the destination.

html, textile, markdown, jsont
jsont and html are both ambiguous
json can be ambiguous

For convenience, the extensions in `config.never-serve` are always assumed to be
source content, even if they don't start with _.  By default these are:
["markdown", "textile"].

For example, all of these are sources:

    src/FAQ.markdown
    src/FAQ.textile
    src/_posts/Index.html
    src/_Intro.html  (an HTML fragment)

But these are both literal HTML files, served exactly as is in the output:

    src/Intro.html
    src/posts/Intro.html

Any path starting with __ is ignored by the source content scanner.

Special files in the source tree:

    __layouts       Directory for top-level layouts (JSON Template files)
    __config.json   Configuration file for this source tree

__config.json
-------------

This can store default values for various flags.

In addition it can store global template data, used in all JSON Template
expansions:

    { "dest-dir": "../my-site",
      # Default is {source-dir}/__layouts
      "layouts-dir": "~/my-jesyll-layouts",   
      "globals": {
        "signature": "-- Andy",
        "domain": "www.example.com"
      },
    
      # TODO:
      pygments,
      "more-converters": {
        "markdown": "foo {filename}",
        "textfile": "textfile {filename}",
        "latex": "dot {filename}",
        "dot": "dot {filename}",
      }
      # Lookup variables in here too
      "$config-base": "~/my-jesyll-config.json"
    }

__layouts
---------

This directory contains JSON Template files.

Source Items
------------

**Source items** are the content you author.  They can be written in various
formats, but *always* define a JSON object, which is then expanded into a JSON
Template.  (There can be more than one template expansion.)

Suppose you have a file called: `2009-10-28-Welcome-to-my-Nightmare.textile`
with the contents "Welcome!"

This defines a source item:

    { "date" :       "2009-10-28",
      "title":       "Welcome to my Nightmare",
      "body" :       "Welcome!"
      "source-type": "textile",
    }

You can define additional **metadata** in the "front matter" of the file, like
this:

    ---
    date:      2009-10-28
    author:    Alice
    title:     A different title
    published: no
    $layout:   pretty    # This doc will be expanded with __layouts/pretty.jsont
    ---
    Welcome!

This represents the source item object:

    { "date"  : "2009-10-28",
      "author": "Alice"
      "title" : "A different title",
      "body"  : "Welcome!"
    }

Notice the `$layout` attribute is not part of the source item.  It is used by
the Jesyll engine rather than by JSON Template.

Source Items As JSON
--------------------

Source items may also be defined using a **JSON file** rather than a flat file
with front matter.

Here's how to show a pretty version of the Jesyll source on the web:

jesyll-source.json:

    { "date": "2009",
      "filename": "jesyll-source.json",
      "filepath": "doc/jesyll-source.json",
      "$filename.code": "jesyll.js"
      "$layout": "source-code.jsont"
    }

Evaluates to:

    { "code": "function jesyll() {}",    # Jesyll source code
    }

source-code.jsont:

    Listing of <b>{filepath}</b>
    <pre>
    {code|raw}
    </pre>

In this case, `$layout` defaults to a JSON Template with a similar filename: jesyll-source.jsont.  We override it with a generic code template in this example.
