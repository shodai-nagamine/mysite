CREATE POLICY "Anyone can update books"
ON books
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can delete books"
ON books
FOR DELETE
TO public
USING (true);
